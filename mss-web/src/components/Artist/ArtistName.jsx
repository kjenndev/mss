import { useLayoutEffect, useRef } from 'react';
import Typography from '@mui/material/Typography';
import styles from './Artist.Component.Detail.module.css';

// Measure the browser's native unbreakable segments, not the whole name:
// spaces, Unicode line-breaking and grapheme shaping remain the browser's job.
export default function ArtistName({ name }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const heading = ref.current;
    let active = true;
    let frame;
    let lastWidth;
    const fit = () => {
      if (!active) return;
      const width = heading.getBoundingClientRect().width;
      lastWidth = width;
      if (!width) return;
      const probe = heading.cloneNode(true);
      probe.setAttribute('aria-hidden', 'true');
      Object.assign(probe.style, {
        position: 'fixed', visibility: 'hidden', pointerEvents: 'none',
        left: '0', top: '0', width: 'min-content', maxWidth: 'none',
        minWidth: '0', margin: '0', fontSize: '', overflowWrap: 'normal',
        wordBreak: 'normal',
      });
      heading.parentElement.appendChild(probe);
      try {
        const intended = parseFloat(getComputedStyle(probe).fontSize);
        let size = intended;
        if (probe.getBoundingClientRect().width > width) {
          let low = Math.min(24, intended);
          let high = intended;
          // Actual shaped DOM metrics include kerning, letter spacing and the dot.
          for (let i = 0; i < 12; i++) {
            const middle = (low + high) / 2;
            probe.style.fontSize = `${middle}px`;
            if (probe.getBoundingClientRect().width <= width) low = middle;
            else high = middle;
          }
          size = low;
        }
        heading.style.fontSize = size === intended ? '' : `${size}px`;
      } finally {
        probe.remove();
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    fit();
    // Ignore height changes caused by fitting; write outside observer delivery.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (heading.getBoundingClientRect().width !== lastWidth) schedule();
    });
    observer?.observe(heading);
    window.addEventListener('resize', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    document.fonts?.ready.then(() => { if (active) schedule(); });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
    };
  }, [name]);
  return <Typography ref={ref} component="h1" className={styles.artistName}>{name}<span aria-hidden="true">.</span></Typography>;
}
