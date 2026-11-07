/// <summary>Which side a creature is on: attacks only hurt the other side, and neutral animals can't be hurt.</summary>
public enum Team { Neutral, Player, Enemy }

/// <summary>
/// Hit points. <see cref="Hurt"/> takes damage with a knockback shove (through the object's
/// <see cref="CharacterBody"/>), a white flash and a moment of invulnerability; at zero, <see cref="Died"/> fires.
/// </summary>
public class Health : Behaviour
{
    public float Max = 10f;
    public Team Team = Team.Neutral;
    /// <summary>Seconds after a hit during which further hits are ignored.</summary>
    public float Invulnerable = 0.35f;

    /// <summary>Every active Health, so attacks and projectiles find targets without searching the scene.</summary>
    public static readonly List<Health> All = [];
    /// <summary>Raised for every hit (the HUD shows damage numbers).</summary>
    public static event Action<Health, float>? Damaged;
    public event Action<Health>? Died;

    public float Current { get; private set; }
    public bool IsDead => Current <= 0f;
    /// <summary>The middle of the body, where attacks aim.</summary>
    public Vector3 Centre => Transform.Position + new Vector3(0f, 0.6f, 0f);

    const float FlashSeconds = 0.12f;
    float _safeUntil, _flash;
    CharacterBody? _body;
    MeshRenderer[] _renderers = [];

    protected override void Awake() => Current = Max;
    protected override void OnEnable() => All.Add(this);
    protected override void OnDisable() => All.Remove(this);
    protected override void Start()
    {
        _body = GetComponent<CharacterBody>();
        _renderers = GameObject.GetComponentsInChildren<MeshRenderer>().ToArray();
    }

    protected override void Update()
    {
        if (_flash <= 0f) return;
        _flash = MathF.Max(0f, _flash - Time.UnscaledDeltaTime); // unscaled: hit-stop slows game time
        foreach (var renderer in _renderers) renderer.Glow = Color.White with { A = _flash / FlashSeconds * 1.6f };
    }

    /// <summary>Whether attacks from <paramref name="attacker"/>'s team can hurt this.</summary>
    public bool IsFoeOf(Team attacker) => Team != Team.Neutral && Team != attacker && !IsDead;

    /// <summary>Takes damage and is shoved away from <paramref name="from"/>. Returns false if the hit didn't land.</summary>
    public bool Hurt(float amount, Vector3 from, float knockback = 6f)
    {
        if (IsDead || Time.TimeSinceStart < _safeUntil) return false;
        _safeUntil = Time.TimeSinceStart + Invulnerable;
        Current = MathF.Max(0f, Current - amount);
        _flash = FlashSeconds;
        var away = (Transform.Position - from) with { Y = 0f };
        if (away.LengthSquared() > 1e-4f) _body?.Push(Vector3.Normalize(away) * knockback + Vector3.UnitY * 4f);
        Damaged?.Invoke(this, amount);
        if (IsDead) Died?.Invoke(this);
        return true;
    }

    public void Heal(float amount) => Current = MathF.Min(Max, Current + amount);

    public void Revive() => Current = Max;
}
