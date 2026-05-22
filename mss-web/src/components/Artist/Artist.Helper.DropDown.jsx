import { useState, useEffect } from 'react';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import OutlinedInput from '@mui/material/OutlinedInput';
import * as helpers from '../../Data.Helper.Api';

export default function ArtistDropdown({ selectedIds = [], onUpdate, multiple = true }) {
  const [artists, setArtists] = useState([]);

  useEffect(() => {
    helpers.GetAllArtists().then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setArtists(data.artists || []);
      }
    });
  }, []);

  const handleChange = (event) => {
    const {
      target: { value },
    } = event;
    onUpdate(typeof value === 'string' ? value.split(',') : value);
  };

  return (
    <FormControl fullWidth variant="outlined">
      <InputLabel id="artist-dropdown-label">Artists</InputLabel>
      <Select
        labelId="artist-dropdown-label"
        multiple={multiple}
        value={selectedIds}
        onChange={handleChange}
        input={<OutlinedInput label="Artists" />}
        renderValue={(selected) => {
            if (multiple) {
                return artists
                  .filter((a) => selected.includes(a.id))
                  .map((a) => a.name)
                  .join(', ');
            } else {
                const artist = artists.find(a => a.id === selected);
                return artist ? artist.name : '';
            }
        }}
      >
        {artists.map((artist) => (
          <MenuItem key={artist.id} value={artist.id}>
            {multiple && <Checkbox checked={selectedIds.indexOf(artist.id) > -1} />}
            <ListItemText primary={artist.name} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
