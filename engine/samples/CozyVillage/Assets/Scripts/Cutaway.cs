/// <summary>
/// Cuts a building open (walls down to <see cref="CutHeight"/>, roof gone) while it would hide the player: when
/// they are inside it, or behind it as seen from the camera. The cut slides down and back up quickly. Only the
/// drawing is cut; the walls still block and still cast their shadows.
/// </summary>
public class Cutaway : Behaviour
{
    /// <summary>How high the walls stay, above this object's origin.</summary>
    public float CutHeight = 1.1f;
    public float Speed = 12f;

    MeshRenderer[] _renderers = [];
    Bounds _bounds;
    float _clip = float.PositiveInfinity;

    protected override void Start()
    {
        _renderers = GameObject.GetComponentsInChildren<MeshRenderer>().ToArray();
        var boxes = _renderers.Select(r => r.WorldBounds).OfType<Bounds>().ToList();
        if (boxes.Count == 0) return;
        _bounds = new Bounds(boxes.Aggregate(boxes[0].Min, (m, b) => Vector3.Min(m, b.Min)), boxes.Aggregate(boxes[0].Max, (m, b) => Vector3.Max(m, b.Max)));
    }

    protected override void OnDisable()
    {
        foreach (var renderer in _renderers) renderer.ClipAbove = float.PositiveInfinity;
    }

    protected override void LateUpdate()
    {
        if (_renderers.Length == 0) return;
        float top = _bounds.Max.Y + 0.1f, cut = Transform.Position.Y + CutHeight;
        float target = Hides() ? cut : top;
        float current = float.IsPositiveInfinity(_clip) ? top : _clip;
        current = MathX.Lerp(current, target, 1f - MathF.Exp(-Speed * Time.DeltaTime));
        _clip = current > top - 0.02f ? float.PositiveInfinity : current;
        foreach (var renderer in _renderers) renderer.ClipAbove = _clip;
    }

    /// <summary>Whether the line from the player towards the camera passes through the building.</summary>
    bool Hides()
    {
        if (CameraFollow.Focus is not { } focus || Camera.Main is not { } camera) return false;
        var eye = focus.Position + new Vector3(0f, 0.7f, 0f);
        if ((eye - _bounds.Center).LengthSquared() > 400f) return false; // far away: skip the test
        var expanded = new Bounds(_bounds.Min - new Vector3(0.3f, 0f, 0.3f), _bounds.Max + new Vector3(0.3f, 0f, 0.3f));
        var toCamera = camera.Orthographic ? -camera.Transform.Forward : Vector3.Normalize(camera.Transform.Position - eye);
        return expanded.Intersect(new Ray(eye, toCamera)) is not null;
    }
}
