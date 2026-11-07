/// <summary>
/// Time of day, weather and night monsters.
/// <list type="bullet">
/// <item>The sun crosses the sky from morning to evening (long warm shadows early and late, short at noon), then the
/// moon does the same at night: the same kind of light and shadows, weaker and blue. Light shafts follow along,
/// as sun shafts by day and moon shafts by night.</item>
/// <item>Now and then it rains: darker, greyer, cloud shadows drift over, no light shafts, and rain falls.</item>
/// <item>At night <see cref="Enemies"/> spawn around the player, out of sight.</item>
/// <item>A clock at the top right shows the day, the hour, and the sun or moon on its arc.</item>
/// </list>
/// The scene's own sun, atmosphere and light shafts are the look of a clear noon.
/// </summary>
public class DayNight : Behaviour
{
    /// <summary>Found in the scene when empty.</summary>
    public Light? Sun;
    public Atmosphere? Atmosphere;
    public Transform? Player;
    /// <summary>Seconds of daylight (6:00 to 20:00) and of night (20:00 to 6:00).</summary>
    public float DayLength = 240f, NightLength = 120f;
    /// <summary>Seconds over which dusk and dawn fade.</summary>
    public float Twilight = 15f;
    /// <summary>Where the first day starts, as a fraction of the daylight.</summary>
    [Range(0, 1)] public float StartTime = 0.1f;
    public List<Prefab> Enemies = [];
    public int MaxEnemies = 8;
    public float SpawnInterval = 3f;

    // The look
    [Range(0, 1)] public float MoonStrength = 0.45f;
    public Color MoonColor = new(0.62f, 0.7f, 1f);
    public Color DuskColor = new(1f, 0.6f, 0.36f);
    public Color NightSky = new(0.24f, 0.29f, 0.53f);
    public Color NightGround = new(0.17f, 0.17f, 0.28f);

    // Weather
    /// <summary>Chance that it rains, rolled every minute or so.</summary>
    [Range(0, 1)] public float RainChance = 0.3f;

    /// <summary>Daylight now (enemies crumble in it).</summary>
    public static bool IsDay { get; private set; } = true;

    float _clock, _spawnTimer, _bannerUntil, _rain, _weatherTimer;
    bool _raining, _wasDay = true;
    int _day = 1;
    // The clear-noon look, read from the scene at the start.
    Color _sunColor, _sky, _ground;
    float _sunIntensity, _shadowStrength, _ambient, _clouds, _shaftIntensity, _shaftAngle, _exposure, _saturation;
    Color _shaftColor;
    LightShafts? _shafts;
    ColorAdjustments? _grade;
    readonly List<GameObject> _spawned = [];
    static readonly Color Text = new(0.98f, 0.95f, 0.88f), Shadow = new(0.1f, 0.07f, 0.05f, 0.8f), Panel = new(0.17f, 0.12f, 0.09f, 0.85f);

    float Cycle => DayLength + NightLength;

    protected override void Start()
    {
        Sun ??= Scene?.FindFirst<Light>();
        Atmosphere ??= Scene?.FindFirst<Atmosphere>();
        if (Sun is not null) (_sunColor, _sunIntensity, _shadowStrength) = (Sun.Color, Sun.Intensity, Sun.ShadowStrength);
        if (Atmosphere is not null) (_sky, _ground, _ambient, _clouds) = (Atmosphere.SkyColor, Atmosphere.GroundColor, Atmosphere.AmbientIntensity, Atmosphere.CloudShadows);
        CreateWeatherVolume();
        _clock = StartTime * DayLength;
        _weatherTimer = 0f; // roll the weather at once
        IsDay = true;
    }

    protected override void OnDisable() => IsDay = true;

    /// <summary>A volume of our own over the scene's, with copies of its light shafts and colour grading to animate
    /// (changing the scene's profile asset would change it for good).</summary>
    void CreateWeatherVolume()
    {
        if (Scene is not { } scene) return;
        var effects = scene.FindAll<Volume>().OrderBy(v => v.Priority).SelectMany(v => v.Profile?.Effects ?? []).ToList();
        var shafts = effects.OfType<LightShafts>().LastOrDefault() ?? new LightShafts { Intensity = 0f };
        var grade = effects.OfType<ColorAdjustments>().LastOrDefault() ?? new ColorAdjustments();
        _shafts = new LightShafts { Color = shafts.Color, Intensity = shafts.Intensity, Angle = shafts.Angle, Width = shafts.Width, Speed = shafts.Speed };
        _grade = new ColorAdjustments { PostExposure = grade.PostExposure, Contrast = grade.Contrast, Saturation = grade.Saturation, HueShift = grade.HueShift, ColorFilter = grade.ColorFilter };
        (_shaftColor, _shaftIntensity, _shaftAngle, _exposure, _saturation) = (shafts.Color, shafts.Intensity, shafts.Angle, grade.PostExposure, grade.Saturation);
        var volume = scene.CreateGameObject("Weather Volume", Transform).AddComponent<Volume>();
        volume.Priority = 1000;
        volume.Profile = new PostProcessProfile { Name = "Weather", Effects = [_shafts, _grade] };
    }

    protected override void Update()
    {
        _clock += Time.DeltaTime;
        float t = _clock % Cycle;
        IsDay = t < DayLength;
        if (IsDay && !_wasDay) _day++;
        if (!IsDay && _wasDay) _bannerUntil = Time.TimeSinceStart + 3f;
        _wasDay = IsDay;

        UpdateWeather();
        // How far the sun (by day) or the moon (by night) is along its arc, and how bright it is: it fades out at the
        // horizon so the switch from sun to moon doesn't jump.
        float arc = IsDay ? t / DayLength : (t - DayLength) / NightLength;
        float length = IsDay ? DayLength : NightLength;
        // The fade is short so low morning and evening light still casts long shadows.
        float up = Math.Clamp(MathF.Min(arc, 1f - arc) * length / (Twilight * 0.35f), 0f, 1f);
        ApplyLight(arc, up * up * (3f - 2f * up), Darkness(t));
        if (!IsDay) Spawn();
        DrawClock(t, arc);
        DrawRain();
    }

    /// <summary>0 in daylight, 1 at night, fading over the twilight before nightfall and before dawn.</summary>
    float Darkness(float t)
    {
        if (t < DayLength) return Math.Clamp((t - (DayLength - Twilight)) / Twilight, 0f, 1f);
        return 1f - Math.Clamp((t - Cycle + Twilight) / Twilight, 0f, 1f);
    }

    void ApplyLight(float arc, float up, float darkness)
    {
        float height = MathF.Sin(arc * MathF.PI);          // 0 at the horizons, 1 at noon or midnight
        float overcast = 1f - 0.55f * _rain;
        if (Sun is not null)
        {
            // East to west, low in the morning and evening, high at noon.
            Sun.Transform.LocalEulerAngles = new Vector3(-(16f + 46f * height), -135f + MathX.Lerp(70f, -70f, arc), 0f);
            var color = IsDay ? Color.Lerp(DuskColor, _sunColor, MathF.Sqrt(height)) : MoonColor;
            Sun.Color = Color.Lerp(color, new Color(0.75f, 0.78f, 0.85f), _rain * 0.6f);
            Sun.Intensity = _sunIntensity * (IsDay ? 1f : MoonStrength) * up * overcast;
            Sun.ShadowStrength = _shadowStrength * (IsDay ? 1f : 0.8f) * (1f - 0.6f * _rain);
        }
        if (Atmosphere is not null)
        {
            Atmosphere.SkyColor = Color.Lerp(Color.Lerp(_sky, NightSky, darkness), new Color(0.6f, 0.63f, 0.7f), _rain * 0.4f * (1f - darkness));
            Atmosphere.GroundColor = Color.Lerp(_ground, NightGround, darkness);
            Atmosphere.AmbientIntensity = MathX.Lerp(_ambient, _ambient * 0.55f, darkness) * (1f - 0.2f * _rain);
            Atmosphere.CloudShadows = MathX.Lerp(_clouds, 0.45f, _rain);
        }
        if (_shafts is not null)
        {
            _shafts.Color = IsDay ? Color.Lerp(DuskColor, _shaftColor, MathF.Sqrt(height)) : MoonColor;
            _shafts.Intensity = _shaftIntensity * (IsDay ? 1f : 0.8f) * up * (1f - _rain);
            _shafts.Angle = _shaftAngle + (arc - 0.5f) * 40f; // the bands lean with the light
        }
        if (_grade is not null)
        {
            _grade.PostExposure = _exposure - 0.3f * _rain - 0.15f * darkness;
            _grade.Saturation = _saturation * (1f - 0.25f * _rain);
        }
    }

    void UpdateWeather()
    {
        _weatherTimer -= Time.DeltaTime;
        if (_weatherTimer <= 0f)
        {
            _raining = Random.Shared.NextSingle() < RainChance;
            _weatherTimer = 50f + Random.Shared.NextSingle() * 50f;
        }
        _rain = MathX.Lerp(_rain, _raining ? 1f : 0f, 1f - MathF.Exp(-0.4f * Time.DeltaTime)); // clouds roll in over a few seconds
    }

    /// <summary>Every few seconds, an enemy on dry ground 11–15 units from the player, until there are enough.</summary>
    void Spawn()
    {
        _spawned.RemoveAll(e => e.IsDestroyed);
        _spawnTimer -= Time.DeltaTime;
        if (_spawnTimer > 0f || _spawned.Count >= MaxEnemies || Enemies.Count == 0 || Player is null || Scene is not { } scene) return;
        _spawnTimer = SpawnInterval;
        float angle = Random.Shared.NextSingle() * MathF.Tau, distance = 11f + Random.Shared.NextSingle() * 4f;
        var at = Player.Position + new Vector3(MathF.Cos(angle), 0f, MathF.Sin(angle)) * distance;
        if (Physics.GroundAt(scene, at with { Y = 40f }, 0.3f, 40f) is not { Water: false } ground) return;
        at.Y = ground.Height;
        if (Physics.Blocked(scene, at, 0.3f, 1.2f)) return; // inside a house or a tree
        var enemy = scene.Instantiate(Enemies[Random.Shared.Next(Enemies.Count)]);
        enemy.Transform.Position = at;
        _spawned.Add(enemy);
    }

    /// <summary>The panel at the top right: a little sky with the sun or moon on its arc, the day and the hour.</summary>
    void DrawClock(float t, float arc)
    {
        var size = new Vector2(62, 34);
        var at = new Vector2(Gui.Width - size.X - 6, 6);
        Gui.DrawRect(at, size, Panel);

        var sky = new Vector2(at.X + 3, at.Y + 3);
        var skySize = new Vector2(size.X - 6, 15);
        var skyColor = IsDay ? Color.Lerp(new Color(0.95f, 0.62f, 0.4f), new Color(0.55f, 0.76f, 0.95f), MathF.Sqrt(MathF.Sin(arc * MathF.PI)))
                             : new Color(0.13f, 0.16f, 0.32f);
        Gui.DrawRect(sky, skySize, Color.Lerp(skyColor, new Color(0.5f, 0.52f, 0.58f), _rain * 0.6f));
        Gui.DrawRect(sky + new Vector2(0, skySize.Y - 2), new Vector2(skySize.X, 2), new Color(0.4f, 0.55f, 0.25f)); // the horizon
        // The body on a half-ellipse from the left horizon (rising) to the right (setting).
        var centre = sky + new Vector2(skySize.X / 2, skySize.Y - 2);
        var body = centre + new Vector2(-MathF.Cos(arc * MathF.PI) * (skySize.X / 2 - 4), -MathF.Sin(arc * MathF.PI) * (skySize.Y - 6));
        if (IsDay)
        {
            Gui.DrawRect(body - new Vector2(2, 1), new Vector2(4, 2), new Color(1f, 0.9f, 0.4f));
            Gui.DrawRect(body - new Vector2(1, 2), new Vector2(2, 4), new Color(1f, 0.9f, 0.4f));
        }
        else
        {
            Gui.DrawRect(body - new Vector2(2, 2), new Vector2(4, 4), new Color(0.92f, 0.94f, 1f));
            Gui.DrawRect(body - new Vector2(0, 2), new Vector2(2, 2), skyColor); // a crescent bite
        }

        float hours = IsDay ? 6f + 14f * arc : (20f + 10f * arc) % 24f;
        string time = $"{(int)hours:00}:{(int)(hours % 1f * 60f) / 10 * 10:00}";
        Gui.DrawText((IsDay ? "DAY " : "NIGHT ") + _day, at + new Vector2(4, 22), IsDay ? new Color(1f, 0.88f, 0.45f) : new Color(0.7f, 0.78f, 1f));
        Gui.DrawText(time, at + new Vector2(size.X - 4 - Gui.MeasureText(time).X, 22), Text);

        if (Time.TimeSinceStart < _bannerUntil)
        {
            const string banner = "NIGHT FALLS. MONSTERS ARE OUT!";
            var bannerSize = Gui.MeasureText(banner, 2);
            Gui.DrawText(banner, new Vector2(MathF.Round((Gui.Width - bannerSize.X) / 2), 46), new Color(0.75f, 0.82f, 1f), 2, Shadow);
        }
    }

    /// <summary>Slanted streaks falling over the screen, as many as the rain is heavy.</summary>
    void DrawRain()
    {
        if (_rain < 0.02f) return;
        int drops = (int)(160 * _rain);
        float now = Time.TimeSinceStart;
        var color = new Color(0.78f, 0.84f, 0.98f, 0.45f * _rain);
        for (int i = 0; i < drops; i++)
        {
            float speed = 180f + (i * 37 % 60);
            float x = ((i * 7919 % 1000) / 1000f * (Gui.Width + 60) + now * speed * 0.25f) % (Gui.Width + 60) - 30;
            float y = ((i * 104729 % 1000) / 1000f * (Gui.Height + 20) + now * speed) % (Gui.Height + 20) - 10;
            Gui.DrawLine(new Vector2(x, y), new Vector2(x - 2, y - 7), color);
        }
    }
}
