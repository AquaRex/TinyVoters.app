/// <summary>
/// The player's heads-up display: hearts, health bars over hurt enemies, damage numbers and short messages that
/// float up from where things happen, impact bursts, and the fainted screen.
/// </summary>
public class PlayerHud : Behaviour
{
    public Texture? HeartIcon, EmptyHeartIcon;

    readonly record struct Popup(Vector3 World, string Text, Color Color, float Born);
    static readonly List<Popup> Popups = [];
    readonly record struct Spark(Vector3 World, Color Color, float Born, float Size);
    static readonly List<Spark> Sparks = [];
    const float SparkSeconds = 0.16f;
    const float PopupSeconds = 0.9f;
    static readonly Color Shadow = new(0.1f, 0.07f, 0.05f, 0.8f);

    Health? _health;

    /// <summary>Floats a short text up from a point in the world (damage, pickups, warnings).</summary>
    public static void Show(Vector3 world, string text, Color color) => Popups.Add(new Popup(world, text, color, Time.TimeSinceStart));

    /// <summary>A quick star of rays bursting out from a point: a hit landing, an explosion.</summary>
    public static void Burst(Vector3 world, Color color, float size = 1f) => Sparks.Add(new Spark(world, color, Time.TimeSinceStart, size));

    protected override void Start() => _health = GetComponent<Health>();
    protected override void OnEnable() => Health.Damaged += OnDamaged;
    protected override void OnDisable() => Health.Damaged -= OnDamaged;

    void OnDamaged(Health target, float amount) =>
        Show(target.Transform.Position + new Vector3(0f, 1.6f, 0f), amount.ToString("0"), target == _health ? Color.Red : Color.White);

    protected override void Update()
    {
        DrawHearts();
        if (Camera.Main is { } camera)
        {
            DrawEnemyBars(camera);
            DrawPopups(camera);
            DrawSparks(camera);
        }
        if (_health is { IsDead: true })
        {
            Gui.DrawRect(Vector2.Zero, new Vector2(Gui.Width, Gui.Height), new Color(0.05f, 0.03f, 0.08f, 0.55f));
            Centered("YOU FAINTED", Gui.Height / 2f - 8, 2, Color.White);
            Centered("WAKING UP AT HOME...", Gui.Height / 2f + 8, 1, new Color(0.9f, 0.85f, 0.8f));
        }
    }

    /// <summary>One heart per 2 health; a faded heart for an odd one.</summary>
    void DrawHearts()
    {
        if (_health is null || HeartIcon is null) return;
        int hearts = (int)MathF.Ceiling(_health.Max / 2f);
        for (int i = 0; i < hearts; i++)
        {
            var at = new Vector2(6 + i * 13, 6);
            float fill = _health.Current - i * 2;
            if (EmptyHeartIcon is not null) Gui.DrawTexture(at, new Vector2(16), EmptyHeartIcon);
            if (fill >= 2f) Gui.DrawTexture(at, new Vector2(16), HeartIcon);
            else if (fill > 0f) Gui.DrawTexture(at, new Vector2(16), HeartIcon, new Color(1f, 1f, 1f, 0.45f));
        }
    }

    static void DrawEnemyBars(Camera camera)
    {
        foreach (var enemy in Health.All)
        {
            if (enemy.Team != Team.Enemy || enemy.Current >= enemy.Max || enemy.IsDead) continue;
            if (camera.WorldToScreenPoint(enemy.Transform.Position + new Vector3(0f, 1.7f, 0f)) is not { } screen) continue;
            var at = Gui.FromScreen(screen) - new Vector2(8, 0);
            Gui.DrawRect(at - Vector2.One, new Vector2(18, 4), Shadow);
            Gui.DrawRect(at, new Vector2(16 * enemy.Current / enemy.Max, 2), new Color(0.9f, 0.25f, 0.25f));
        }
    }

    static void DrawPopups(Camera camera)
    {
        Popups.RemoveAll(p => Time.TimeSinceStart - p.Born > PopupSeconds);
        foreach (var popup in Popups)
        {
            float age = (Time.TimeSinceStart - popup.Born) / PopupSeconds;
            if (camera.WorldToScreenPoint(popup.World) is not { } screen) continue;
            var size = Gui.MeasureText(popup.Text);
            var at = Gui.FromScreen(screen) - new Vector2(size.X / 2, 10 * age);
            float alpha = age < 0.7f ? 1f : (1f - age) / 0.3f;
            Gui.DrawText(popup.Text, new Vector2(MathF.Round(at.X), MathF.Round(at.Y)), popup.Color with { A = alpha }, shadow: Shadow with { A = 0.8f * alpha });
        }
    }

    static void DrawSparks(Camera camera)
    {
        float now = Time.TimeSinceStart;
        Sparks.RemoveAll(s => (now - s.Born) / s.Size > SparkSeconds * 2f);
        foreach (var spark in Sparks)
        {
            float t = (now - spark.Born) / (SparkSeconds * MathF.Max(1f, spark.Size)); // big bursts last longer
            if (t > 1f || camera.WorldToScreenPoint(spark.World) is not { } screen) continue;
            var centre = Gui.FromScreen(screen);
            float inner = (3f + 10f * t) * spark.Size, outer = (6f + 14f * t) * spark.Size;
            for (int i = 0; i < 8; i++)
            {
                float angle = i * MathF.PI / 4f + 0.2f;
                var direction = new Vector2(MathF.Cos(angle), MathF.Sin(angle));
                Gui.DrawLine(centre + direction * inner, centre + direction * outer, spark.Color with { A = 1f - t }, i % 2 == 0 ? 2f : 1f);
            }
        }
    }

    static void Centered(string text, float y, int size, Color color) =>
        Gui.DrawText(text, new Vector2(MathF.Round((Gui.Width - Gui.MeasureText(text, size).X) / 2), y), color, size, Shadow);
}
