/// <summary>Keeps the camera at a fixed offset from a target, easing after it, and shakes on impacts.</summary>
public class CameraFollow : Behaviour
{
    public Transform? Target;
    public Vector3 Offset = new(0f, 28.28f, 28.28f);
    public float Sharpness = 5f;

    /// <summary>What the camera follows, i.e. what must stay visible (<see cref="Cutaway"/> cuts buildings open for it).</summary>
    public static Transform? Focus { get; private set; }

    static float _shake;
    Vector3 _smoothed;
    bool _started;

    /// <summary>Jolts the camera by up to <paramref name="amount"/> units, dying away quickly.</summary>
    public static void Shake(float amount) => _shake = MathF.Max(_shake, amount);

    protected override void LateUpdate()
    {
        if (Target is null) return;
        Focus = Target;
        if (!_started) (_smoothed, _started) = (Transform.Position, true);
        _smoothed = MathX.Damp(_smoothed, Target.Position + Offset, Sharpness, Time.DeltaTime);
        _shake = MathF.Max(0f, _shake - Time.UnscaledDeltaTime * 2.5f);
        var jitter = new Vector3(Random.Shared.NextSingle() - 0.5f, 0f, Random.Shared.NextSingle() - 0.5f) * 2f * _shake;
        Transform.Position = _smoothed + jitter;
    }
}
