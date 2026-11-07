/// <summary>
/// A bouncy walk for box-model characters and animals: they hop with a little squash on landing, swing their legs
/// and arms, and bob their head; standing still they gently breathe. It watches how the object moves, so any
/// movement script works. Animates the child "Model" and parts named "Head", "Leg…" and "Arm…".
/// </summary>
public class CuteWalk : Behaviour
{
    public float HopHeight = 0.14f;
    public float StepsPerSecond = 3.2f;
    public float SwingDegrees = 40f;
    /// <summary>Holds the arms up by this many degrees (forward is positive), e.g. a shambling undead reaching out;
    /// raised arms swing less.</summary>
    [Range(-180, 180)] public float ArmRaise;

    Transform? _model, _head;
    readonly List<Transform> _legs = [], _arms = [];
    Vector3 _lastPosition;
    float _phase, _walking;

    protected override void Start()
    {
        _model = Transform.FindDescendant("Model");
        _head = Transform.FindDescendant("Head");
        Collect(Transform, "Leg", _legs);
        Collect(Transform, "Arm", _arms);
        _lastPosition = Transform.Position;
    }

    protected override void LateUpdate()
    {
        float dt = MathF.Max(Time.DeltaTime, 1e-4f);
        var delta = Transform.Position - _lastPosition;
        _lastPosition = Transform.Position;
        float speed = new Vector2(delta.X, delta.Z).Length() / dt;
        _walking = MathX.Lerp(_walking, speed > 0.1f ? 1f : 0f, 1f - MathF.Exp(-12f * dt));
        if (_walking > 0.01f) _phase += dt * StepsPerSecond * MathF.PI;

        float bounce = MathF.Abs(MathF.Sin(_phase));
        float landing = (1f - bounce) * _walking;               // squash when feet touch down
        float breath = MathF.Sin(Time.TimeSinceStart * 2.4f) * (1f - _walking);
        if (_model is not null)
        {
            _model.LocalPosition = new Vector3(0f, bounce * HopHeight * _walking, 0f);
            _model.LocalScale = new Vector3(1f + landing * 0.08f, 1f - landing * 0.1f + breath * 0.025f, 1f + landing * 0.08f);
        }
        float swing = MathF.Sin(_phase * 2f) * SwingDegrees * _walking;
        for (int i = 0; i < _legs.Count; i++) _legs[i].LocalEulerAngles = new Vector3(i % 2 == 0 ? swing : -swing, 0f, 0f);
        float armSwing = swing * (1f - MathF.Abs(ArmRaise) / 120f);
        for (int i = 0; i < _arms.Count; i++) _arms[i].LocalEulerAngles = new Vector3(ArmRaise + (i % 2 == 0 ? -armSwing : armSwing), 0f, 0f);
        if (_head is not null)
            _head.LocalEulerAngles = new Vector3(breath * 3f, 0f, MathF.Sin(_phase) * 6f * _walking);
    }

    static void Collect(Transform root, string prefix, List<Transform> results)
    {
        foreach (var child in root.Children)
        {
            if (child.Name.StartsWith(prefix)) results.Add(child);
            Collect(child, prefix, results);
        }
    }
}
