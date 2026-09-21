using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using NinetyAgent.Client.Core;

namespace NinetyAgent.Client.Core;

/// <summary>
/// Snapshot of everything needed to keep enforcing a lock/session correctly if the LAN drops
/// mid-game, and to resynchronize the instant it comes back.
/// </summary>
public sealed class CachedSessionState
{
    [JsonPropertyName("stationId")] public string StationId { get; set; } = string.Empty;
    [JsonPropertyName("sessionId")] public string? SessionId { get; set; }
    [JsonPropertyName("state")] public string State { get; set; } = "LOCKED_IDLE";
    [JsonPropertyName("remainingSeconds")] public int RemainingSeconds { get; set; }
    [JsonPropertyName("lastSyncedUtc")] public DateTimeOffset LastSyncedUtc { get; set; }
    [JsonPropertyName("cacheVersion")] public int CacheVersion { get; set; } = 1;
}

[JsonSerializable(typeof(CachedSessionState))]
[JsonSourceGenerationOptions(WriteIndented = false)]
internal partial class SessionCacheJsonContext : JsonSerializerContext
{
}

/// <summary>
/// Persists <see cref="CachedSessionState"/> to a small local JSON file so that:
///   1. If the LAN/master server drops mid-session, the agent still knows the remaining
///      balance/time locally and keeps counting it down / enforcing the lock correctly
///      without needing the server (blueprint: "LAN Network Resilience").
///   2. On process crash + Watchdog respawn, the new process instance picks up exactly where
///      the old one left off instead of resetting to a fresh, unlocked state (which would be
///      a free-play security hole).
/// Writes are atomic (write-to-temp then File.Move) so a power cut mid-write can never leave
/// a half-written, unparsable cache file behind — that failure mode would either brick the
/// lock (denial of service to the venue) or, worse, silently unlock it.
/// SQLite was the blueprint's other suggested option; JSON was chosen here to avoid bundling
/// a native SQLite binary into an already footprint-constrained AOT/R2R build. A single ~200
/// byte JSON document rewritten roughly once a second is well within the <0.5% CPU budget —
/// SQLite would only start paying for itself if the cache needed relational queries, which it
/// does not.
/// </summary>
public sealed class LocalSessionCache
{
    private readonly string _filePath;
    private readonly SemaphoreSlim _fileLock = new(1, 1);
    private readonly ILogSink _log;

    public LocalSessionCache(ILogSink log, string? overridePath = null)
    {
        _log = log;
        var dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NinetyGamingHouse", "Agent");
        Directory.CreateDirectory(dataDir);
        _filePath = overridePath ?? Path.Combine(dataDir, "session_cache.json");
    }

    public async Task SaveAsync(CachedSessionState state, CancellationToken ct = default)
    {
        state.LastSyncedUtc = DateTimeOffset.UtcNow;
        var json = JsonSerializer.SerializeToUtf8Bytes(state, SessionCacheJsonContext.Default.CachedSessionState);

        await _fileLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var tempPath = _filePath + ".tmp";
            await File.WriteAllBytesAsync(tempPath, json, ct).ConfigureAwait(false);
            // File.Move with overwrite is atomic on NTFS for same-volume moves — this is the
            // step that guarantees we never observe a partially-written cache file.
            File.Move(tempPath, _filePath, overwrite: true);
        }
        catch (Exception ex)
        {
            _log.Error("[LocalSessionCache] Failed to persist session cache.", ex);
        }
        finally
        {
            _fileLock.Release();
        }
    }

    public async Task<CachedSessionState?> LoadAsync(CancellationToken ct = default)
    {
        await _fileLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (!File.Exists(_filePath)) return null;
            await using var stream = File.OpenRead(_filePath);
            return await JsonSerializer.DeserializeAsync(stream, SessionCacheJsonContext.Default.CachedSessionState, ct)
                .ConfigureAwait(false);
        }
        catch (JsonException ex)
        {
            // Corrupt cache (e.g. truncated by a hard power-loss before our atomic move landed
            // for an earlier write, on a filesystem where that guarantee doesn't hold) must
            // fail CLOSED, not open: treat as "no cached authorization" so the station re-locks
            // and waits for the server rather than trusting garbage data.
            _log.Error("[LocalSessionCache] Cache file was corrupt; discarding and failing closed.", ex);
            return null;
        }
        finally
        {
            _fileLock.Release();
        }
    }

    /// <summary>
    /// True if the cached snapshot is "fresh enough" to keep enforcing offline, false if it's
    /// stale enough that we should assume the worst (e.g. the agent was off for days) and force
    /// a hard re-lock with no local time grant until the server re-authorizes.
    /// </summary>
    public static bool IsFreshEnoughForOfflineEnforcement(CachedSessionState state, TimeSpan maxStaleness)
        => DateTimeOffset.UtcNow - state.LastSyncedUtc <= maxStaleness;
}
