import sqlite3
import os
import hashlib

class User:
    _get_by_id_statement = "SELECT * FROM Users WHERE id = ?"
    _get_by_username_statement = "SELECT * FROM Users WHERE username = ?"
    _create_statement = "INSERT INTO Users (username, password) VALUES (?, ?)"
    _update_statement = "UPDATE Users SET username = ?, password = ? WHERE id = ?"
    _authenticate_statement = "SELECT * FROM Users WHERE username = ? AND password = ?"

    def __init__(self, username=None, password=None):
        self.id = None
        self.username = username
        self.password = password

    def GetAllUsers(self):
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        try:
            cur.execute("SELECT * FROM Users")
            rows = cur.fetchall()
        except Exception as e:
            print("Error occurred while fetching users: " + str(e))
        finally:
            con.close()

        users = []
        for row in rows:
            user = User()
            user.id = row[0]
            user.username = row[1]
            user.password = row[2]
            users.append(user)

        return users

    def GetUserByID(self, user_id):
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        try:
            cur.execute(self._get_by_id_statement, (user_id,))
            row = cur.fetchone()
        except Exception as e:
            print("Error occurred while fetching user: " + str(e))
        finally:
            con.close()

        if row:
            self.id = row[0]
            self.username = row[1]
            self.password = row[2]
            return self
        else:
            return None
        
    def GetUserByUsername(self, username):
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        try:
            cur.execute(self._get_by_username_statement, (username,))
            row = cur.fetchone()
        except Exception as e:
            print("Error occurred while fetching user: " + str(e))
        finally:
            con.close()

        if row:
            self.id = row[0]
            self.username = row[1]
            self.password = row[2]
            return self
        else:
            return None
        
    def CreateUser(self):
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        try:
            cur.execute(self._create_statement, (self.username, self.__hash(self.password)))
            self.id = cur.lastrowid
            con.commit()
        except Exception as e:
            print("Error occurred while creating user: " + str(e))
        finally:
            con.close()

    def update_user(self):
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        try:
            cur.execute(self._update_statement, (self.username, self.__hash(self.password), self.id))
            con.commit()
        except Exception as e:
            print("Error occurred while updating user: " + str(e))
        finally:
            con.close()

    def Authenticate(self, username, password):
        db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mss.db'))
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        try:
            cur.execute(self._authenticate_statement, (username, self.__hash(password)))
            row = cur.fetchone()
        except Exception as e:
            print("Error occurred while authenticating user: " + str(e))
        finally:
            con.close()

        if row:
            self.id = row[0]
            self.username = row[1]
            self.password = row[2]
            return self
        else:
            return None
        
    def __hash(self, val):
        hash_object = hashlib.md5(val.encode())
        return hash(hash_object.hexdigest())