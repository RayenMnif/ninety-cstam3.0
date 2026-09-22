namespace NinetyAgent.Client.Networking;

public sealed class AuthLoginPayload
{
    public string UsernameOrEmail { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public sealed class AuthRegisterPayload
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = "GAMER";
}

public sealed class AuthResponsePayload
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? UserId { get; set; }
    public string? Username { get; set; }
    public string? Role { get; set; }
}