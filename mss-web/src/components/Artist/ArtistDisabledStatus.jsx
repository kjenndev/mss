import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Tooltip from '@mui/material/Tooltip';
import styles from './ArtistDisabledStatus.module.css';

const label = 'Disabled artist — visible only to artists and admins';

export default function ArtistDisabledStatus() {
  return <Tooltip title={label}>
    <span className={styles.status} role="status" tabIndex={0} aria-label={label}>
      <VisibilityOffIcon aria-hidden="true" fontSize="small" />
    </span>
  </Tooltip>;
}
