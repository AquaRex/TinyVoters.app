/// <summary>
/// Uses the equipped item with the left mouse button, towards the mouse.
/// <list type="bullet">
/// <item>Swords and axes slash: a quick wind-up, a sweep across the body (alternating sides for combos) with a trail,
/// and every enemy in the arc is hit, with a lunge, a flash, a split-second freeze and a little camera shake.</item>
/// <item>Bows and crossbows are drawn while the button is held, slowing the player and showing an aim line that
/// grows as the draw charges; releasing fires, harder and faster the fuller the draw.</item>
/// <item>Potions heal.</item>
/// </list>
/// When the player faints they wake up at the start a few seconds later.
/// </summary>
public class PlayerCombat : Behaviour
{
    public Prefab? Arrow;
    /// <summary>Half the angle of a melee swing, in degrees.</summary>
    public float SwingArc = 70f;
    /// <summary>Seconds to fully draw a bow.</summary>
    public float DrawTime = 0.7f;
    public float RespawnSeconds = 3f;

    const float SwingTime = 0.3f, WindUp = 0.25f;   // wind-up is that fraction of the swing
    const float MinDraw = 0.12f, AimLength = 11f;
    static readonly Color Trail = new(1f, 0.97f, 0.88f), AimColor = new(1f, 1f, 1f, 0.75f), Charged = new(1f, 0.86f, 0.35f);

    Inventory? _inventory;
    Health? _health;
    CharacterBody? _body;
    PlayerController? _controller;
    Vector3 _aim = -Vector3.UnitZ, _home;
    float _ready, _swing, _draw = -1f, _faintedFor, _freeze;
    Item? _strike;                 // a swing whose blow hasn't landed yet
    int _side = 1;                 // which way the next slash sweeps
    bool _hasHome;

    bool Drawing => _draw >= 0f;
    float Charge => Math.Clamp(_draw / DrawTime, 0f, 1f);

    protected override void Start()
    {
        _inventory = GetComponent<Inventory>();
        _health = GetComponent<Health>();
        _body = GetComponent<CharacterBody>();
        _controller = GetComponent<PlayerController>();
    }

    protected override void Update()
    {
        UpdateFreeze();
        if (!_hasHome && _body is { IsGrounded: true }) (_home, _hasHome) = (Transform.Position, true); // where the world put us
        if (_health is { IsDead: true })
        {
            _draw = -1f;
            Faint();
            return;
        }
        _swing = MathF.Max(0f, _swing - Time.DeltaTime);
        // The blow lands as the blade comes round (after the wind-up), not on the click, so it matches what you see.
        if (_strike is { } pending && 1f - _swing / SwingTime >= WindUp)
        {
            _strike = null;
            Strike(pending);
        }
        var item = _inventory?.Equipped;
        if (item?.Kind != ItemKind.Ranged) _draw = -1f; // switched away mid-draw
        if (_controller is not null) _controller.SpeedMultiplier = Drawing ? 0.45f : 1f;
        if (_inventory is not { IsOpen: false } || item is null) return;

        bool overUi = _inventory.PointerOverUi;
        if (item.Kind == ItemKind.Ranged)
        {
            Bow(item, overUi);
            return;
        }
        if (overUi || !Input.GetMouseButton(MouseButton.Left) || Time.TimeSinceStart < _ready) return;
        _aim = Aim();
        _ready = Time.TimeSinceStart + item.Cooldown;
        if (item.Kind == ItemKind.Melee) Slash(item);
        else Drink(item);
    }

    protected override void LateUpdate()
    {
        float progress = _swing > 0f ? 1f - _swing / SwingTime : 1f;
        // Face the attack while it plays (walking would turn us), twisting the body with the slash.
        if (_swing > 0f || Drawing)
        {
            float twist = _swing > 0f ? SwingAngle(progress) * 0.35f : 0f;
            Transform.Rotation = MathX.LookRotation(Rotate(_aim, twist), Vector3.UnitY);
        }
        if (_inventory?.Hand is not { } hand) return;
        if (_swing > 0f && _inventory.Equipped?.Kind == ItemKind.Melee)
            // Blade level and pointing out, sweeping round the body.
            hand.LocalEulerAngles = new Vector3(-95f, SwingAngle(progress) * 0.65f, 0f); // plus the body's twist
        else if (Drawing)
            hand.LocalEulerAngles = new Vector3(-10f - 15f * Charge, 0f, 0f); // bow raised, string pulled back
        else hand.LocalEulerAngles = new Vector3(-70f, 0f, 0f);

        if (_swing > 0f && _inventory.Equipped?.Kind == ItemKind.Melee) DrawTrail(progress);
        if (Drawing) DrawAimLine();
    }

    // ---- Melee ----

    /// <summary>The blade's angle (degrees, 0 = straight ahead) during a swing: pulled back past the start, then a fast
    /// eased sweep to the far side.</summary>
    float SwingAngle(float progress)
    {
        float start = SwingArc + 25f, end = -SwingArc - 10f;
        float angle = progress < WindUp
            ? MathX.Lerp(SwingArc, start, Ease(progress / WindUp))
            : MathX.Lerp(start, end, 1f - MathF.Pow(1f - (progress - WindUp) / (1f - WindUp), 3f));
        return angle * _side;
    }

    static float Ease(float t) => t * t * (3f - 2f * t);

    void Slash(Item item)
    {
        // Aim assist: a foe in reach and roughly ahead pulls the swing towards it, so near misses still connect.
        if (NearestFoe(item.Reach + 0.6f, 100f) is { } foe)
            _aim = Vector3.Normalize((foe.Transform.Position - Transform.Position) with { Y = 0f });
        _swing = SwingTime;
        _side = -_side;
        _strike = item;
        _body?.Push(_aim * 3f); // a small lunge into the swing
    }

    /// <summary>Hits every foe the blade sweeps through: within reach of its body's edge (not just its centre), inside the
    /// arc or right up close.</summary>
    void Strike(Item item)
    {
        float minDot = MathF.Cos((SwingArc + 15f) * MathX.Deg2Rad);
        bool hit = false;
        foreach (var target in Health.All)
        {
            if (!target.IsFoeOf(Team.Player)) continue;
            var to = (target.Transform.Position - Transform.Position) with { Y = 0f };
            float distance = to.Length(), radius = target.GetComponent<CharacterBody>()?.Radius ?? 0.3f;
            if (distance - radius > item.Reach || MathF.Abs(target.Transform.Position.Y - Transform.Position.Y) > 1.5f) continue;
            if (distance < 0.9f || Vector3.Dot(to / distance, _aim) >= minDot)
            {
                if (!target.Hurt(item.Damage, Transform.Position, 7f + item.Damage)) continue;
                hit = true;
                PlayerHud.Burst(target.Centre, Color.White);
            }
        }
        if (!hit) return;
        Freeze(0.06f + item.Damage * 0.01f);
        CameraFollow.Shake(0.07f + item.Damage * 0.012f);
    }

    /// <summary>The nearest foe within <paramref name="range"/> and <paramref name="degrees"/> of the aim.</summary>
    Health? NearestFoe(float range, float degrees)
    {
        Health? best = null;
        float bestDistance = range, minDot = MathF.Cos(degrees * MathX.Deg2Rad);
        foreach (var target in Health.All)
        {
            if (!target.IsFoeOf(Team.Player)) continue;
            var to = (target.Transform.Position - Transform.Position) with { Y = 0f };
            float distance = to.Length();
            if (distance < bestDistance && (distance < 0.5f || Vector3.Dot(to / distance, _aim) >= minDot)) (best, bestDistance) = (target, distance);
        }
        return best;
    }

    /// <summary>A crescent trail behind the blade tip, fading towards its tail.</summary>
    void DrawTrail(float progress)
    {
        if (progress < WindUp || Camera.Main is not { } camera) return;
        const int segments = 10;
        float head = SwingAngle(progress), tail = SwingAngle(MathF.Max(WindUp, progress - 0.35f));
        var centre = Transform.Position + new Vector3(0f, 0.5f, 0f);
        float reach = (_inventory?.Equipped?.Reach ?? 1.6f) + 0.1f;
        Vector2? Point(float angle, float radius) =>
            camera.WorldToScreenPoint(centre + Rotate(_aim, angle) * radius) is { } p ? Gui.FromScreen(p) : null;
        for (int i = 0; i < segments; i++)
        {
            float a0 = MathX.Lerp(tail, head, i / (float)segments), a1 = MathX.Lerp(tail, head, (i + 1) / (float)segments);
            float width = 0.15f + 0.45f * (i + 1) / segments;
            if (Point(a0, reach) is { } outer0 && Point(a1, reach) is { } outer1 &&
                Point(a1, reach - width) is { } inner1 && Point(a0, reach - width * 0.8f) is { } inner0)
                Gui.DrawQuad(outer0, outer1, inner1, inner0, Trail with { A = 0.95f * (i + 1) / segments * (1.2f - progress * 0.6f) });
        }
    }

    // ---- Ranged ----

    void Bow(Item item, bool overUi)
    {
        if (!Drawing)
        {
            if (Input.GetMouseButtonDown(MouseButton.Left) && !overUi && Time.TimeSinceStart >= _ready) _draw = 0f;
            return;
        }
        _aim = Aim();
        if (Input.GetMouseButton(MouseButton.Left))
        {
            _draw += Time.DeltaTime;
            return;
        }
        // Released: a quick tap still fires, but weakly.
        if (_draw >= MinDraw) Shoot(item, Charge);
        _draw = -1f;
        _ready = Time.TimeSinceStart + item.Cooldown * 0.5f;
    }

    /// <summary>Where arrows leave the bow.</summary>
    Vector3 ArrowStart => Transform.Position + new Vector3(0f, 0.7f, 0f) + _aim * 0.5f;

    /// <summary>A dashed line along the arrow's flight that stops where it would land (a wall, a block, an enemy), with
    /// a mark there: a red cross on an enemy, a small square on anything else.</summary>
    void DrawAimLine()
    {
        if (Camera.Main is not { } camera || Scene is not { } scene) return;
        float charge = Charge;
        var from = ArrowStart;
        var (length, target, blocked) = Projectile.Trace(scene, from, _aim, MathX.Lerp(3f, AimLength, charge), Team.Player);
        var color = charge >= 1f ? Charged : AimColor with { A = 0.4f + 0.4f * charge };
        Vector2? Screen(float d) => camera.WorldToScreenPoint(from + _aim * d) is { } p ? Gui.FromScreen(p) : null;
        for (float d = 0.1f; d < length; d += 0.6f)
            if (Screen(d) is { } a && Screen(MathF.Min(d + 0.35f, length)) is { } b)
                Gui.DrawLine(a, b, color, charge >= 1f ? 2f : 1f);
        if (Screen(length) is not { } end) return;
        if (target is not null)
        {
            var red = new Color(1f, 0.3f, 0.25f);
            Gui.DrawLine(end - new Vector2(3, 3), end + new Vector2(3, 3), red, 2f);
            Gui.DrawLine(end - new Vector2(3, -3), end + new Vector2(3, -3), red, 2f);
        }
        else if (blocked) Gui.DrawFrame(end - new Vector2(2.5f), new Vector2(5), color);
        else Gui.DrawRect(end - new Vector2(1.5f), new Vector2(3), color);
    }

    void Shoot(Item item, float charge)
    {
        if (_inventory is null || Arrow is null || Scene is not { } scene) return;
        if (_inventory.Arrows <= 0)
        {
            PlayerHud.Show(Transform.Position + new Vector3(0f, 2f, 0f), "NO ARROWS", Color.Yellow);
            return;
        }
        _inventory.Arrows--;
        var arrow = scene.Instantiate(Arrow);
        arrow.Transform.Position = ArrowStart;
        if (arrow.GetComponent<Projectile>() is { } projectile)
        {
            projectile.Direction = _aim;
            projectile.Damage = MathF.Round(item.Damage * MathX.Lerp(0.5f, 1.5f, charge));
            projectile.Speed = MathX.Lerp(9f, 22f, charge);
            projectile.Team = Team.Player;
        }
        if (charge >= 1f) CameraFollow.Shake(0.04f);
    }

    // ---- Other ----

    void Drink(Item item)
    {
        if (_health is null || _inventory is null || _health.Current >= _health.Max) return;
        _health.Heal(item.Heal);
        _inventory.Consume(item);
        PlayerHud.Show(Transform.Position + new Vector3(0f, 2f, 0f), $"+{item.Heal:0}", Color.Green);
    }

    /// <summary>Hit-stop: game time nearly stops for a moment so a hit lands with weight.</summary>
    void Freeze(float seconds)
    {
        _freeze = seconds;
        Time.TimeScale = 0.05f;
    }

    void UpdateFreeze()
    {
        if (_freeze <= 0f) return;
        _freeze -= Time.UnscaledDeltaTime;
        if (_freeze <= 0f) Time.TimeScale = 1f;
    }

    /// <summary>The horizontal direction from the player to the point under the mouse.</summary>
    Vector3 Aim()
    {
        if (Camera.Main is not { } camera) return _aim;
        var ray = camera.ScreenPointToRay(Input.MousePosition);
        float y = Transform.Position.Y + 0.6f;
        if (ray.IntersectHorizontalPlane(y) is not { } distance) return _aim;
        var to = (ray.GetPoint(distance) - Transform.Position) with { Y = 0f };
        return to.LengthSquared() > 1e-4f ? Vector3.Normalize(to) : _aim;
    }

    /// <summary>A horizontal direction turned by some degrees about the vertical (positive turns left).</summary>
    static Vector3 Rotate(Vector3 direction, float degrees) =>
        Vector3.Transform(direction, Quaternion.CreateFromAxisAngle(Vector3.UnitY, degrees * MathX.Deg2Rad));

    void Faint()
    {
        if (_controller is not null) _controller.Enabled = false;
        _faintedFor += Time.DeltaTime;
        if (_faintedFor < RespawnSeconds) return;
        _faintedFor = 0f;
        Transform.Position = _home + new Vector3(0f, 1f, 0f);
        _body?.SnapToGround();
        _health!.Revive();
        if (_controller is not null) _controller.Enabled = true;
    }
}
