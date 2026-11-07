/// <summary>Strolls between random spots near where it started, pausing now and then. Walks around obstacles' edges
/// with a <see cref="CharacterBody"/> and picks a new spot when something is in the way.</summary>
public class Wander : Behaviour
{
    public float Radius = 3f;
    public float Speed = 1.2f;
    [Range(0, 5)] public float PauseSeconds = 1.5f;

    readonly Random _random = new();
    CharacterBody? _body;
    Vector3 _home, _target;
    float _wait;

    protected override void Start()
    {
        _body = GetComponent<CharacterBody>();
        _home = Transform.Position;
        PickTarget();
    }

    protected override void Update()
    {
        if (_wait > 0f)
        {
            _wait -= Time.DeltaTime;
            return;
        }
        var toTarget = (_target - Transform.Position) with { Y = 0f };
        float distance = toTarget.Length();
        if (distance < 0.05f)
        {
            Rest();
            return;
        }
        var step = toTarget / distance * MathF.Min(Speed * Time.DeltaTime, distance);
        var moved = _body?.Move(step) ?? Move(step);
        if (moved.LengthSquared() < step.LengthSquared() * 0.04f)
        {
            Rest(); // something is in the way: try somewhere else
            return;
        }
        Transform.Rotation = MathX.LookRotation(moved with { Y = 0f }, Vector3.UnitY);
    }

    Vector3 Move(Vector3 step)
    {
        Transform.Position += step;
        return step;
    }

    void Rest()
    {
        _wait = PauseSeconds * _random.NextSingle() * 2f;
        PickTarget();
    }

    void PickTarget()
    {
        float angle = _random.NextSingle() * MathF.Tau, distance = _random.NextSingle() * Radius;
        _target = _home + new Vector3(MathF.Cos(angle), 0f, MathF.Sin(angle)) * distance;
    }
}
