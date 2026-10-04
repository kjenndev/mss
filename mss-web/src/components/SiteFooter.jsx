import { Link } from 'react-router-dom';
import styles from './SiteFooter.module.css';

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.directory}>
        <div className={styles.intro}>
          <Link to="/" className={styles.brand} aria-label="Midnight Sound Syndicate home">
            <img src="/msslogo.jpg" alt="" width="44" height="44" />
            <span>Midnight Sound<small>SYNDICATE</small></span>
          </Link>
          <p className={styles.caption}>Explore the artists, discover events,<br />and get in touch.</p>
        </div>
        <nav className={styles.column} aria-label="Footer explore">
          <h2>Explore</h2>
          <Link to="/about">About</Link>
          <Link to="/artists">Artists</Link>
          <Link to="/events">Events</Link>
          <a href="https://zowiemedia.net/zowieshop/" target="_blank" rel="noopener noreferrer">Shop <span aria-hidden="true">↗</span><span className={styles.srOnly}> (opens in a new tab)</span></a>
        </nav>
        <div className={styles.column}>
          <h2>Get in touch</h2>
          <a className={styles.mail} href="mailto:support@midnightsoundsyndicate.com">support@midnightsoundsyndicate.com</a>
          <nav aria-label="Footer legal">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
        </div>
      </div>
      <div className={styles.bottom}>
        <span>© Midnight Sound Syndicate</span>
        <button type="button" onClick={() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
          document.querySelector('header a[href="/"]')?.focus({ preventScroll: true });
        }}>Back to top <span aria-hidden="true">↑</span></button>
      </div>
    </footer>
  );
}
