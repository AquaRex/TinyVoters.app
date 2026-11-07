/// <summary>An arrow: flies straight, hurts the first creature of another team it reaches, and sticks into walls and
/// the ground for a moment before disappearing.</summary>
public class Projectile : Behaviour
{
    public float Speed = 16f;
    public float Damage = 2f;
    public Team Team = Team.Player;
    public float Lifetime = 2.5f;
    /// <summary>Set by whoever fires it.</summary>
    public Vector3 Direction = -Vector3.UnitZ;

    float _age;
    bool _stuck;

    protected override void Update()
    {
        _age += Time.DeltaTime;
        if (_age > Lifetime && Scene is { } owner) owner.Destroy(GameObject);
        if (_stuck || Scene is not { } scene) return;

        var position = Transform.Position;
        var next = position + Direction * Speed * Time.DeltaTime;
        if (FoeAt(next, Team) is { } target)
        {
            if (target.Hurt(Damage, position, 4f)) PlayerHud.Burst(target.Centre, new Color(1f, 0.95f, 0.8f), 0.7f);
            scene.Destroy(GameObject);
            return;
        }
        if (SolidAt(scene, next))
        {
            _stuck = true;
            _age = MathF.Max(_age, Lifetime - 1f);
            return;
        }
        Transform.Position = next;
        Transform.Rotation = MathX.LookRotation(Direction, Vector3.UnitY);
    }

    /// <summary>
    /// Where a shot from <paramref name="from"/> along <paramref name="direction"/> would end within
    /// <paramref name="range"/>: the distance to the first wall, block or foe, and the foe if it hits one. Uses the same
    /// tests as a flying arrow, so an aim line drawn with it shows exactly where the arrow lands.
    /// </summary>
    public static (float Distance, Health? Target, bool Blocked) Trace(Scene scene, Vector3 from, Vector3 direction, float range, Team team)
    {
        const float step = 0.1f;
        for (float d = step; d < range; d += step)
        {
            var point = from + direction * d;
            if (FoeAt(point, team) is { } target) return (d, target, true);
            if (SolidAt(scene, point)) return (d, null, true);
        }
        return (range, null, false);
    }

    static Health? FoeAt(Vector3 point, Team team)
    {
        foreach (var target in Health.All)
        {
            if (!target.IsFoeOf(team)) continue;
            var offset = target.Centre - point;
            if ((offset with { Y = 0f }).LengthSquared() < 0.45f * 0.45f && MathF.Abs(offset.Y) < 0.8f) return target;
        }
        return null;
    }

    static bool SolidAt(Scene scene, Vector3 point) =>
        Physics.Blocked(scene, new Bounds(point - new Vector3(0.05f), point + new Vector3(0.05f)));
}
