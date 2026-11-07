/// <summary>Walks with WASD or the arrow keys (up is north, -Z, which is up on screen) and jumps with Space, around
/// obstacles when the object has a <see cref="CharacterBody"/>.</summary>
public class PlayerController : Behaviour
{
    public float Speed = 4f;
    public float JumpHeight = 1.3f;

    /// <summary>Scales walking speed (drawing a bow slows the player down).</summary>
    public float SpeedMultiplier { get; set; } = 1f;

    CharacterBody? _body;

    protected override void Start() => _body = GetComponent<CharacterBody>();

    protected override void Update()
    {
        if (Input.GetKey(Key.Space)) _body?.Jump(JumpHeight);
        var input = Input.Movement;
        if (input == Vector2.Zero) return;
        var step = new Vector3(input.X, 0f, -input.Y) * Speed * SpeedMultiplier * Time.DeltaTime;
        if (_body is not null) step = _body.Move(step);
        else Transform.Position += step;
        if (step.LengthSquared() > 1e-8f) Transform.Rotation = MathX.LookRotation(step with { Y = 0f }, Vector3.UnitY);
    }
}
