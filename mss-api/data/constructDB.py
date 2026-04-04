import sqlite3

_scripts = '''
    CREATE TABLE IF NOT EXISTS "Artists" (
	"id"	INTEGER NOT NULL UNIQUE,
	"name"	TEXT NOT NULL UNIQUE,
	"location"	TEXT,
	"description"	TEXT,
	"youtube"	TEXT,
	"twitch"	TEXT,
	"soundcloud"	TEXT,
	"mixcloud"	TEXT,
    "userid"	INTEGER NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT));
        
    CREATE TABLE IF NOT EXISTS "Users" (
	"id"	INTEGER NOT NULL UNIQUE,
	"username"	TEXT NOT NULL UNIQUE,
	"password"	TEXT NOT NULL,
	PRIMARY KEY("id" AUTOINCREMENT))
'''

def scaffold():
    print("Scaffolding database...")
    con = sqlite3.connect("mss.db")
    cur = con.cursor()
    cur.executescript(_scripts)
    con.commit()
    con.close()
    