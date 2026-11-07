/// <summary>How a creature attacks.</summary>
public enum EnemyAttack
{
    /// <summary>Walks up and hits.</summary>
    Melee,
    /// <summary>Keeps its distance, circling, and shoots arrows.</summary>
    Ranged,
    /// <summary>Walks up, swells and flashes for <see cref="Enemy.Fuse"/> seconds, then bursts, hurting everything
    /// near. Backing off far enough in time makes it calm down.</summary>
    Explode,
}

/// <summary>
/// A night creature: hunts the player when it sees them, jumps up steps in its way and attacks its own way
/// (<see cref="EnemyAttack"/>). It crumbles at dawn, and when killed it squashes away and spills its
/// <see cref="Drops"/>.
/// </summary>
public class Enemy : Behaviour
{
    public EnemyAttack Attack = EnemyAttack.Melee;
    public float Speed = 2.2f;
    public float Damage = 1f;
    /// <summary>How close the player must be to attack (melee reach, bow range, or where the fuse starts).</summary>
    public float AttackRange = 1.1f;
    public float Cooldown = 1f;
    public float SightRange = 16f;
    /// <summary>Ranged: backs off when the player comes closer than this.</summary>
    public float KeepAway = 5f;
    public Prefab? Arrow;
    /// <summary>Explode: seconds of warning, and how far the blast reaches (damage falls off with distance).</summary>
    public float Fuse = 1.3f, BlastRadius = 3f;
    public List<Drop> Drops = [];
    /// <summary>The <see cref="Pickup"/> prefab that drops are spilled as.</summary>
    public Prefab? DropPrefab;

    CharacterBody? _body;
    Health? _health;
    MeshRenderer[] _renderers = [];
    float _ready, _dying = -1f, _fuse = -1f;

    protected override void Start()
    {
        _body = GetComponent<CharacterBody>();
        _health = GetComponent<Health>();
        _renderers = GameObject.GetComponentsInChildren<MeshRenderer>().ToArray();
        if (_health is not null) _health.Died += OnDied;
        _ready = Time.TimeSinceStart + Cooldown;
    }

    protected override void Update()
    {
        if (Scene is not { } scene) return;
        if (_dying >= 0f)
        {
            // Squash and shrink away rather than vanishing on the killing blow.
            _dying += Time.DeltaTime;
            float t = _dying / 0.3f;
            Transform.LocalScale = new Vector3(1f + t * 0.3f, MathF.Max(0.01f, 1f - t), 1f + t * 0.3f);
            if (t >= 1f) scene.Destroy(GameObject);
            return;
        }
        if (DayNight.IsDay)
        {
            PlayerHud.Show(Transform.Position + new Vector3(0f, 1.5f, 0f), "POOF", new Color(0.8f, 0.8f, 0.85f));
            scene.Destroy(GameObject);
            return;
        }
        if (Inventory.Player?.GetComponent<Health>() is not { IsDead: false } player) return;

        var to = (player.Transform.Position - Transform.Position) with { Y = 0f };
        float distance = to.Length();
        if (_fuse >= 0f)
        {
            Hiss(scene, distance);
            return;
        }
        if (distance > SightRange || distance < 1e-3f) return;
        var direction = to / distance;
        Transform.Rotation = MathX.LookRotation(direction, Vector3.UnitY);
        Chase(direction, distance);

        if (distance > AttackRange || Time.TimeSinceStart < _ready) return;
        _ready = Time.TimeSinceStart + Cooldown;
        switch (Attack)
        {
            case EnemyAttack.Melee: player.Hurt(Damage, Transform.Position, 6f); break;
            case EnemyAttack.Ranged: Shoot(scene, player); break;
            case EnemyAttack.Explode: _fuse = 0f; break;
        }
    }

    void Chase(Vector3 direction, float distance)
    {
        if (_body is null) return;
        Vector3 move;
        if (Attack == EnemyAttack.Ranged)
        {
            // Back off (slowly, so the player can catch up) when crowded, close in when out of range, and drift
            // sideways a little in between.
            float along = distance < KeepAway ? -0.45f : distance > AttackRange * 0.9f ? 1f : 0f;
            var side = new Vector3(-direction.Z, 0f, direction.X) * MathF.Sin(Time.TimeSinceStart * 0.8f + GetHashCode() % 7);
            move = direction * along + side * 0.3f;
        }
        else move = distance > AttackRange * 0.8f ? direction : Vector3.Zero;
        if (move.LengthSquared() < 1e-4f) return;
        var step = (move.LengthSquared() > 1f ? Vector3.Normalize(move) : move) * Speed * Time.DeltaTime;
        if (_body.Move(step).LengthSquared() < step.LengthSquared() * 0.25f) _body.Jump(1.2f); // something in the way
    }

    /// <summary>The exploder's warning: it stands still, swells and flashes faster and faster, then bursts, unless the
    /// player got well away.</summary>
    void Hiss(Scene scene, float distance)
    {
        if (distance > AttackRange * 2.2f)
        {
            _fuse = -1f;
            Transform.LocalScale = Vector3.One;
            foreach (var renderer in _renderers) renderer.Glow = Color.Clear;
            return;
        }
        _fuse += Time.DeltaTime;
        float t = _fuse / Fuse;
        Transform.LocalScale = new Vector3(1f + 0.3f * t, 1f + 0.15f * t, 1f + 0.3f * t);
        bool lit = MathF.Sin(_fuse * (8f + 30f * t)) > 0f;
        foreach (var renderer in _renderers) renderer.Glow = lit ? Color.White with { A = 0.9f } : Color.Clear;
        if (t >= 1f) Explode(scene);
    }

    void Explode(Scene scene)
    {
        var centre = Transform.Position;
        foreach (var target in Health.All.ToArray())
        {
            if (target.Team == Team.Neutral || target.IsDead || target == _health) continue;
            float d = Vector3.Distance(target.Transform.Position, centre);
            if (d < BlastRadius) target.Hurt(MathF.Max(1f, MathF.Round(Damage * (1f - d / BlastRadius))), centre, 14f);
        }
        PlayerHud.Burst(centre + new Vector3(0f, 0.5f, 0f), new Color(1f, 0.75f, 0.35f), 3f);
        PlayerHud.Burst(centre + new Vector3(0f, 0.5f, 0f), Color.White, 1.8f);
        PlayerHud.Show(centre + new Vector3(0f, 1.8f, 0f), "BOOM", new Color(1f, 0.7f, 0.3f));
        CameraFollow.Shake(0.4f);
        scene.Destroy(GameObject); // nothing left to drop
    }

    void Shoot(Scene scene, Health player)
    {
        if (Arrow is null) return;
        var arrow = scene.Instantiate(Arrow);
        var from = Transform.Position + new Vector3(0f, 0.7f, 0f);
        arrow.Transform.Position = from;
        if (arrow.GetComponent<Projectile>() is { } projectile)
        {
            projectile.Direction = Vector3.Normalize((player.Centre - from) with { Y = 0f });
            projectile.Team = Team.Enemy;
        }
    }

    void OnDied(Health health)
    {
        foreach (var renderer in _renderers) renderer.Glow = Color.Clear;
        if (DropPrefab is not null && Scene is { } scene) Pickup.Spill(scene, DropPrefab, Transform.Position, Drops);
        _dying = 0f;
    }
}
