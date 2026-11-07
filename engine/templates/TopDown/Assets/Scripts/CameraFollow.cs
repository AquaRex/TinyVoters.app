/// <summary>Keeps the camera at a fixed offset from a target, easing after it.</summary>
public class CameraFollow : Behaviour
{
    public Transform? Target;
    public Vector3 Offset = new(0f, 28.28f, 28.28f);
    public float Sharpness = 6f;

    protected override void LateUpdate()
    {
        if (Target is not null) Transform.Position = MathX.Damp(Transform.Position, Target.Position + Offset, Sharpness, Time.DeltaTime);
    }
}
