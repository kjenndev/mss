import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sanitizeRichText } from '../sanitize';
import { getImageUrl } from '../config';
import * as helpers from '../Data.Helper.Api';
import styles from './About.Component.module.css';

export default function About() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [content, setContent] = useState('');
  const [coverPhoto, setCoverPhoto] = useState('');
  const [failedCover, setFailedCover] = useState('');
  const [loading, setLoading] = useState(true);
  const isAdmin = helpers.IsAdmin();

  useEffect(() => {
    let active = true;
    helpers.GetSettings().then(async (res) => {
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!active) return;
      if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error();
      for (const key of ['about_content', 'about_cover_photo']) {
        if (data.settings[key] != null && typeof data.settings[key] !== 'string') throw new Error();
      }
      setContent(data.settings?.about_content || '');
      setCoverPhoto(data.settings?.about_cover_photo || '');
      setError('');
    }).catch(() => { if (active) setError('Unable to load About content.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  if (error) return <Alert severity="error">{error}<Button startIcon={<RefreshIcon aria-hidden="true" />} onClick={() => { setError(''); setLoading(true); setAttempt(n => n + 1); }}>Retry</Button></Alert>;
  if (loading) return <div className={styles.loading}><CircularProgress aria-label="Loading About content" /></div>;

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <nav aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true"> / </span><span>About</span></nav>
        {isAdmin && <Button variant="outlined" startIcon={<EditIcon aria-hidden="true" />} onClick={() => navigate('/admin/about')}>Edit Page</Button>}
      </div>
      <div className={styles.identity}>
        <aside className={styles.identityColumn}>
          <p className={styles.eyebrow}>Midnight Sound Syndicate</p>
          <h1 className={styles.title}>About <br />MSS<span aria-hidden="true">.</span></h1>
          {coverPhoto && failedCover !== coverPhoto && <img onError={() => setFailedCover(coverPhoto)} className={styles.cover} src={getImageUrl(coverPhoto)} alt="Midnight Sound Syndicate cover" />}
          <p className={styles.stamp}>Music / Artists / Community</p>
        </aside>
        <section aria-label="About content" className={styles.story}>
          {content.trim() ? <div className={`about-content ${styles.richText}`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(content) }} /> : <p className={styles.empty}>About content has not been added yet.</p>}
          <div className={styles.explore}>
            <Link to="/artists">Meet the artists <ArrowOutwardIcon aria-hidden="true" /></Link>
            <Link to="/events">Explore events <ArrowOutwardIcon aria-hidden="true" /></Link>
          </div>
        </section>
      </div>
    </div>
  );
}
