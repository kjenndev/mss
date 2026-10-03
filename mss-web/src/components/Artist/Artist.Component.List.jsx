import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { useState, useEffect } from 'react';
import { getImageUrl } from '../../config';
import * as helpers from '../../Data.Helper.Api';
import styles from './Artist.Component.List.module.css';

const providers = [['soundcloud', 'SoundCloud'], ['mixcloud', 'Mixcloud'], ['youtube', 'YouTube'], ['twitch', 'Twitch']];
function providerUrl(provider, value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  if (provider === 'twitch' && /^[a-zA-Z0-9_]+$/.test(value)) return `https://twitch.tv/${value}`;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? value : '';
  } catch { return ''; }
}

export default function ArtistList() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [artists, setArtists] = useState([]);
  const [failedPortraits, setFailedPortraits] = useState({});
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('az');
  const search = query.trim().toLocaleLowerCase();
  const visibleArtists = artists.filter(artist =>
    `${artist.name} ${artist.location || ''}`.toLocaleLowerCase().includes(search)
  ).sort((a, b) => (sort === 'az' ? 1 : -1) * a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  useEffect(() => {
    let active = true;
    helpers.GetAllArtists().then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.artists)) throw new Error();
      if (active) { setArtists(data.artists); setError(''); setLoading(false); }
    }).catch(() => { if (active) { setError('Unable to load artists.'); setLoading(false); } });
    return () => { active = false; };
  }, [attempt]);

  return <section className={styles.container} aria-labelledby="artists-heading">
    <header className={styles.lead}>
      <p className={styles.eyebrow}>Midnight Sound Syndicate</p>
      <h1 id="artists-heading">Artists<span aria-hidden="true">.</span></h1>
    </header>
    <div className={styles.tools}>
      <input className={styles.search} type="search" aria-label="Search artists" placeholder="Search artists…" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="Sort artists" value={sort} onChange={event => setSort(event.target.value)}>
        <option value="az">Name A–Z</option><option value="za">Name Z–A</option>
      </select>
      <span className={styles.count} role="status">{loading ? 'Loading artists…' : error ? 'Artist count unavailable' : search ? `${visibleArtists.length} of ${artists.length} artists` : `${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`}</span>
    </div>
    {!loading && !error && artists.length === 0 && <p className={styles.empty}>No artists yet.</p>}
    {!loading && !error && artists.length > 0 && visibleArtists.length === 0 && <p className={styles.empty}>No matching artists. Try another name or location.</p>}
    {error ? <Alert severity="error">{error}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={() => { setLoading(true); setError(''); setAttempt(n => n + 1); }}>Retry</Button></Alert> :
      <div className={styles.grid} aria-busy={loading}>{!loading && visibleArtists.map(artist => <article key={artist.id} className={styles.artist}>
        <div className={styles.portrait}>
          {getImageUrl(artist.profile_picture) && failedPortraits[artist.id] !== artist.profile_picture ? <img src={getImageUrl(artist.profile_picture)} alt={artist.name} loading="lazy" onError={() => setFailedPortraits(current => ({ ...current, [artist.id]: artist.profile_picture }))} /> : <span aria-hidden="true">{artist.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span>}
        </div>
        <div className={styles.info}>
          <h2>{artist.name}</h2>
          {artist.location && <p className={styles.location}>{artist.location}</p>}
          <div className={styles.bottom}>
            <div className={styles.providers}>{providers.map(([key, label]) => {
              const href = providerUrl(key, artist[key]);
              return href ? <a key={key} className={styles.secondaryAction} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : null;
            })}</div>
            <a className={`${styles.action} ${styles.cardLink}`} href={`/artists/${artist.id}`}>View Profile <ArrowOutwardIcon aria-hidden="true" fontSize="small" /></a>
            {helpers.CanEditArtist(artist.id, artist.user_id) && <a className={`${styles.action} ${styles.secondaryAction}`} href={`/artists/${artist.id}/update`}><EditIcon aria-hidden="true" fontSize="small" />Edit</a>}
          </div>
        </div>
      </article>)}</div>}
  </section>;
}
