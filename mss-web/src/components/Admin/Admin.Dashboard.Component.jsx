import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import CardMedia from '@mui/material/CardMedia';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import MuiTextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Chip from '@mui/material/Chip';
import ComputerIcon from '@mui/icons-material/Computer';
import SensorsIcon from '@mui/icons-material/Sensors';
import MemoryIcon from '@mui/icons-material/Memory';
import TimerIcon from '@mui/icons-material/Timer';

import DeleteArtist from '../Artist/Artist.Component.Delete';
import * as helpers from '../../Data.Helper.Api';
import styles from './Admin.Dashboard.Component.module.css';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function AdminDashboard() {
  const [artists, setArtists] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState(0);
  const [editUser, setEditUser] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const refreshData = useCallback(() => {
    if (tab === 0) {
      helpers.GetAllArtists().then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          setArtists(data.artists || []);
        }
      });
    } else if (tab === 1) {
      // Fetch both for the users tab so we can map artist IDs to names in the table and modal
      Promise.all([
        helpers.GetAllUsers(),
        helpers.GetAllArtists()
      ]).then(async ([usersRes, artistsRes]) => {
        if (usersRes.ok) {
          const userData = await usersRes.json();
          setUsers(userData.users || []);
        }
        if (artistsRes.ok) {
          const artistData = await artistsRes.json();
          setArtists(artistData.artists || []);
        }
      });
    } else if (tab === 2) {
      helpers.GetServerStats().then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      });
    }
  }, [tab]);

  useEffect(() => {
    if (!helpers.IsAdmin()) {
      navigate('/');
      return;
    }

    refreshData();
    
    // Polling for stats when tab is active
    let interval;
    if (tab === 2) {
      interval = setInterval(() => {
        helpers.GetServerStats().then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setStats(data.stats);
          }
        });
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [navigate, refreshData, tab]);

  const handleUserDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      const res = await helpers.DeleteUser(id);
      if (res.ok) {
        setUsers(users.filter(u => u.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete user');
      }
    }
  };

  const handleUserEditSave = async () => {
    setError('');
    // Use the first artist in the list as the primary artist_id for legacy support
    const primaryArtistId = editUser.ownedArtistIds && editUser.ownedArtistIds.length > 0 
      ? Number(editUser.ownedArtistIds[0]) 
      : null;

    const updateData = {
      username: editUser.username,
      display_name: editUser.display_name,
      role: editUser.role,
      artist_id: primaryArtistId,
      ownedArtistIds: editUser.ownedArtistIds || [],
      is_disabled: editUser.is_disabled ? 1 : 0
    };
    
    if (editUser.password) {
      updateData.password = editUser.password;
    }

    const res = await helpers.UpdateUser(editUser.id, updateData);
    if (res.ok) {
      setEditUser(null);
      refreshData();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to update user');
    }
  };

  const handleEditUserClick = (user) => {
    // Map existing ownedArtists to just IDs for the select state, ensuring they are Numbers
    const ownedArtistIds = user.ownedArtists ? user.ownedArtists.map(a => Number(a.id)) : [];
    setEditUser({ ...user, ownedArtistIds });
  };

  return (
    <Container className={styles.container}>
      <ThemeProvider theme={darkTheme}>
        <Paper elevation={3} className={styles.headerPaper}>
          <Typography variant="h4">Admin Dashboard</Typography>
          <Typography variant="body1" className={styles.subTitle}>
           Manage Syndicate artists and user accounts.
          </Typography>
        </Paper>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
          <Tabs value={tab} onChange={(e, v) => setTab(v)}>
            <Tab label="Artists" />
            <Tab label="Users" />
            <Tab label="Server" />
          </Tabs>
        </Box>

        {tab === 0 && (
          <>
            <Paper elevation={3} className={styles.actionsPaper}>
              <Button variant="contained" href="/artists/create" className={styles.createButton}>
                Create New Artist
              </Button>
            </Paper>

            <Grid container spacing={3}>
              {artists.map((artist) => (
                <Grid item xs={12} md={6} key={artist.id}>
                  <Card className={styles.artistCard}>
                    {artist.profile_picture && (
                      <CardMedia
                        component="img"
                        image={artist.profile_picture.startsWith('http') ? artist.profile_picture : `http://localhost:4000${artist.profile_picture}`}
                        alt={artist.name}
                        className={styles.artistImage}
                      />
                    )}
                    <CardContent>
                      <Typography variant="h6">{artist.name}</Typography>
                      <Typography color="text.secondary">{artist.location}</Typography>
                      <Typography className={styles.artistDesc}>{artist.description}</Typography>
                    </CardContent>
                    <CardActions>
                      <Button href={`/artists/${artist.id}`}>View</Button>
                      <Button href={`/artists/${artist.id}/update`} size="small">Edit</Button>
                      <DeleteArtist
                        id={artist.id}
                        onDelete={(id) => {
                          setArtists((current) => current.filter((a) => a.id !== id));
                        }}
                      />
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </>
        )}

        {tab === 1 && (
          <>
            <Paper elevation={3} className={styles.actionsPaper}>
              <Button variant="contained" href="/users/create" className={styles.createButton}>
                Create New User
              </Button>
            </Paper>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Username</TableCell>
                    <TableCell>Display Name</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Owned Artists</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} sx={{ opacity: user.is_disabled ? 0.6 : 1 }}>
                      <TableCell>{user.id}</TableCell>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>{user.display_name}</TableCell>
                      <TableCell sx={{ textTransform: 'capitalize' }}>{user.role}</TableCell>
                      <TableCell>
                        {user.is_disabled ? (
                          <Chip label="Disabled" size="small" color="error" variant="outlined" />
                        ) : (
                          <Chip label="Active" size="small" color="success" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        {user.ownedArtists && Array.isArray(user.ownedArtists) && user.ownedArtists.length > 0 
                          ? user.ownedArtists.map(a => a.name).join(', ') 
                          : 'None'}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton onClick={() => handleEditUserClick(user)} color="primary">
                          <EditIcon />
                        </IconButton>
                        <IconButton onClick={() => handleUserDelete(user.id)} color="error">
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {tab === 2 && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(144, 202, 249, 0.05)' }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                      <TimerIcon color="primary" />
                      <Typography color="text.secondary" variant="subtitle2" sx={{ fontWeight: 700 }}>SERVER UPTIME</Typography>
                    </Stack>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {stats?.uptime ? (() => {
                        const s = Math.floor(stats.uptime);
                        const h = Math.floor(s / 3600);
                        const m = Math.floor((s % 3600) / 60);
                        const sec = s % 60;
                        return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                      })() : '0:00:00'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(76, 175, 80, 0.05)' }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                      <SensorsIcon color="success" />
                      <Typography color="text.secondary" variant="subtitle2" sx={{ fontWeight: 700 }}>ACTIVE STREAMS</Typography>
                    </Stack>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {stats?.activeSessions || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      Unique Artist Broadcasts
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(156, 39, 176, 0.05)' }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                      <ComputerIcon color="secondary" />
                      <Typography color="text.secondary" variant="subtitle2" sx={{ fontWeight: 700 }}>ACTIVE RELAYS</Typography>
                    </Stack>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {stats?.relayCount || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      FFmpeg Relay Pipes
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ height: '100%', bgcolor: 'rgba(255, 152, 0, 0.05)' }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                      <MemoryIcon color="warning" />
                      <Typography color="text.secondary" variant="subtitle2" sx={{ fontWeight: 700 }}>MEMORY USAGE</Typography>
                    </Stack>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                      {stats?.memoryUsage?.rss ? (stats.memoryUsage.rss / 1024 / 1024).toFixed(0) : 0} MB
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12}>
                <Paper sx={{ p: 3, bgcolor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>Detailed Diagnostics</Typography>
                  <pre style={{ margin: 0, fontSize: '0.85rem', color: '#90caf9', overflowX: 'auto' }}>
                    {JSON.stringify(stats, null, 2)}
                  </pre>
                </Paper>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Edit User Modal */}
        <Dialog open={Boolean(editUser)} onClose={() => setEditUser(null)} fullWidth maxWidth="xs">
          <DialogTitle>Edit User: {editUser?.username}</DialogTitle>
          <DialogContent>
            <Stack spacing={3} sx={{ mt: 1 }}>
              <MuiTextField
                label="Username"
                fullWidth
                value={editUser?.username || ''}
                onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
              />
              <MuiTextField
                label="Display Name"
                fullWidth
                value={editUser?.display_name || ''}
                onChange={(e) => setEditUser({ ...editUser, display_name: e.target.value })}
                placeholder="Name shown in comments"
              />
              <MuiTextField
                label="New Password (leave blank to keep)"
                type="password"
                fullWidth
                onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
              />
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={editUser?.role || 'artist'}
                  label="Role"
                  onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                >
                  <MenuItem value="artist">Artist</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel id="artist-multiple-select-label">Manage Artists</InputLabel>
                <Select
                  labelId="artist-multiple-select-label"
                  multiple
                  value={editUser?.ownedArtistIds || []}
                  onChange={(e) => setEditUser({ ...editUser, ownedArtistIds: e.target.value.map(val => Number(val)) })}
                  label="Manage Artists"
                  renderValue={(selected) => {
                    const selectedNames = artists
                      .filter(a => selected.some(s => Number(s) === Number(a.id)))
                      .map(a => a.name);
                    return selectedNames.join(', ');
                  }}
                >
                  {artists.map((artist) => {
                    const isSelected = (editUser?.ownedArtistIds || []).some(id => Number(id) === Number(artist.id));
                    return (
                      <MenuItem key={artist.id} value={Number(artist.id)}>
                        <Checkbox checked={isSelected} />
                        <ListItemText primary={artist.name} />
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch 
                    checked={Boolean(editUser?.is_disabled)} 
                    onChange={(e) => setEditUser({ ...editUser, is_disabled: e.target.checked ? 1 : 0 })} 
                    color="error"
                  />
                }
                label="Disable Account"
              />

              {error && <Typography color="error">{error}</Typography>}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}>
            <Button onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleUserEditSave} variant="contained">Save Changes</Button>
          </DialogActions>
        </Dialog>
      </ThemeProvider>
    </Container>
  );
}
