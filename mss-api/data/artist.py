import sqlite3
import os

class Artist:

    # Private Vars
    _get_by_id_statement = 'SELECT * FROM Artists WHERE id=?'
    _get_all_statement = 'SELECT * FROM Artists'
    _delete_statement = 'DELETE FROM Artists WHERE id=?'
    _get_by_name_statement = 'SELECT * FROM Artists WHERE name=?'
    
    _insert_statement = '''
        INSERT INTO Artists (name, location, description, youtube, twitch, soundcloud, mixcloud, userid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    '''
    _update_statement = '''
        UPDATE Artists 
        SET name=?, location=?, description=?, youtube=?, twitch=?, soundcloud=?, mixcloud=?, userid=?
        WHERE id=?
    ''' 
     
    def __init__(self):
        # Public Vars
        self.id = -1
        self.name = ''
        self.location = ''
        self.description = ''
        self.youtube = ''
        self.twitch = ''
        self.soundcloud = '' 
        self.mixcloud = ''
        self.user_id = -1
         
    def Save(self):
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        
        try:
            if getattr(self, 'id', None) is not None and self.id > 0:
                print("Updating existing artist with ID: " + str(self.id))
                cur.execute(self._update_statement, (
                    self.name, self.location, self.description,
                    self.youtube, self.twitch, self.soundcloud, 
                    self.mixcloud, self.user_id, self.id
                ))
            else:
                print("Inserting new artist")
                cur.execute(self._insert_statement, (
                    self.name, self.location, self.description,
                    self.youtube, self.twitch, self.soundcloud, 
                    self.mixcloud, self.user_id
                ))
                self.id = cur.lastrowid
        except Exception as e:
            print("Error occurred while saving artist: " + str(e))

        con.commit()
        con.close()

    def GetByID(self, id):
        print("Getting Artist by ID: " + str(id))
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()

        try:
            cur.execute(self._get_by_id_statement, (id,))
            row = cur.fetchone()
            print(f"Query result for ID {id}: {row}")
            if row:
                self.id = row[0]
                self.name = row[1]
                self.location = row[2]
                self.description = row[3]
                self.youtube = row[4]
                self.twitch = row[5]
                self.soundcloud = row[6]
                self.mixcloud = row[7]
                self.user_id = row[8]

            return self
        except Exception as e:
            print("Error occurred while getting artist: " + str(e))
        
        con.close()

    def GetByName(self, name):
        print("Getting Artist by Name: " + name)
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()

        try:
            cur.execute(self._get_by_name_statement, (name,))
            row = cur.fetchone()
            if row:
                self.id = row[0]
                self.name = row[1]
                self.location = row[2]
                self.description = row[3]
                self.youtube = row[4]
                self.twitch = row[5]
                self.soundcloud = row[6]
                self.mixcloud = row[7]
                self.user_id = row[8]

            return self
        except Exception as e:
            print("Error occurred while getting artist: " + str(e))
        
        con.close()

    def GetAll(self):
        print("Getting all Artists")
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()

        artists = []
        try:
            cur.execute(self._get_all_statement)
            rows = cur.fetchall()
            for row in rows:
                artist = Artist()
                artist.id = row[0]
                artist.name = row[1]
                artist.location = row[2]
                artist.description = row[3]
                artist.youtube = row[4]
                artist.twitch = row[5]
                artist.soundcloud = row[6]
                artist.mixcloud = row[7]
                artist.user_id = row[8]
                artists.append(artist)

            return artists
        except Exception as e:
            print("Error occurred while getting artists: " + str(e))
        
        con.close()

    def Delete(self):
        print("Deleting Artist: " + self.name)
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()

        try:
            cur.execute(self._delete_statement, (self.id,))
            self.id = -1
            self.name = ''
            self.location = ''
            self.description = ''
            self.youtube = ''
            self.twitch = ''
            self.soundcloud = '' 
            self.mixcloud = ''
        except Exception as e:
            print("Error occurred while deleting artist: " + str(e))

        con.commit()
        con.close()