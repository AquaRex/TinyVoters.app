/// <summary>Top-down movement: WASD or the arrow keys walk (up is north, -Z, which is up on screen), Space jumps.
/// Uses the object's <see cref="CharacterBody"/> so it slides along walls, steps up blocks and falls off ledges.</summary>
public class PlayerController : Behaviour
{
    public float Speed = 4f;
    public float JumpHeight = 1.3f;

    CharacterBody? _body;

    protected override void Start() => _body = GetComponent<CharacterBody>();

    protected override void Update()
    {
        if (Input.GetKey(Key.Space)) _body?.Jump(JumpHeight);
        var input = Input.Movement;
        if (input == Vector2.Zero) return;
        var step = new Vector3(input.X, 0f, -input.Y) * Speed * Time.DeltaTime;
        step = _body?.Move(step) ?? step;
        if (_body is null) Transform.Position += step;
        if (step.LengthSquared() > 1e-8f) Transform.Rotation = MathX.LookRotation(step with { Y = 0f }, Vector3.UnitY);
    }
}
