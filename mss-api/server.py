import json
from flask import Flask, request
from flask_cors import CORS
from data import constructDB

from data.artist import Artist
from data.user import User

app = Flask(__name__)
CORS(app)

with app.app_context():
    print("App context created.")
    constructDB.scaffold()

@app.route("/")
def hello_world():
    # placeholder for the web ui
    return "<p>Hello, World!</p>"

### Artist Endpoints ###

# Get all artists
@app.route("/artists", methods=["GET"])
def get_artists():
    artists = Artist().GetAll()

    # Convert Artist objects to dictionaries for JSON serialization
    artist_list = []
    for artist in artists:
        artist_dict = {
            "id": artist.id,
            "name": artist.name,
            "location": artist.location,
            "description": artist.description,
            "youtube": artist.youtube,
            "twitch": artist.twitch,
            "soundcloud": artist.soundcloud,
            "mixcloud": artist.mixcloud,
            "user_id": artist.user_id
        }
        artist_list.append(artist_dict)
        
    return json.dumps(artist_list)

# Get artist by ID
@app.route("/artists/<int:artist_id>", methods=["GET"])
def get_artist(artist_id):
    print(f"Getting artist with ID: {artist_id}")
    artist = Artist().GetByID(artist_id)
    print(f"Retrieved artist: {artist.__dict__ if artist else 'None'}")
    # Convert Artist objects to dictionaries for JSON serialization
    if artist:
        # If we have an artist, return it as JSON
        return json.dumps({
            "id": artist.id,
            "name": artist.name,
            "location": artist.location,
            "description": artist.description,
            "youtube": artist.youtube,
            "twitch": artist.twitch,
            "soundcloud": artist.soundcloud,
            "mixcloud": artist.mixcloud,
            "user_id": artist.user_id
        })
    else:
        # If we don't have an artist, return a 404 error
        return json.dumps({"error": "Artist not found"}), 404

# Create a new artist
@app.route("/artists", methods=["POST"])
def create_artist():
    print("Creating artist...")
    
    # Get the JSON data from the request and create a new Artist object
    data = json.loads(request.get_data())
    print(data)
    artist = Artist()
    artist.name = data['arg'].get("name") 
    artist.location = data['arg'].get("location")
    artist.description = data['arg'].get("description")
    artist.youtube = data['arg'].get("youtube")
    artist.twitch = data['arg'].get("twitch")
    artist.soundcloud = data['arg'].get("soundcloud")
    artist.mixcloud = data['arg'].get("mixcloud")
    artist.user_id = data['arg'].get("userid")

    artist.Save()

    # serialize the artist object to JSON and return it with a 201 status code
    return json.dumps({
        "id": artist.id,
        "name": artist.name,
        "location": artist.location,
        "description": artist.description,
        "youtube": artist.youtube,
        "twitch": artist.twitch,
        "soundcloud": artist.soundcloud,
        "mixcloud": artist.mixcloud,
        "user_id": artist.user_id
    }), 201

# Update an existing artist
@app.route("/artists/<int:artist_id>", methods=["PUT"])
def update_artist(artist_id):
    print(f"Updating artist with ID: {artist_id}")
    # Get the existing artist by ID
    artist = Artist().GetByID(artist_id)
    
    if not artist:
        # If we don't have an artist, return a 404 error
        return json.dumps({"error": "Artist not found"}), 404

    # Get the JSON data from the request and update the Artist object
    data = json.loads(request.get_data())
    print(f"Data received for update: {data}")
    artist.name = data['arg'].get("name")
    artist.location = data['arg'].get("location")
    artist.description = data['arg'].get("description")
    artist.youtube = data['arg'].get("youtube")
    artist.twitch = data['arg'].get("twitch")
    artist.soundcloud = data['arg'].get("soundcloud")
    artist.mixcloud = data['arg'].get("mixcloud")
    artist.user_id = data['arg'].get("user_id")

    artist.Save()

    # serialize the updated artist object to JSON and return it
    return json.dumps({
        "id": artist.id,
        "name": artist.name,
        "location": artist.location,
        "description": artist.description,
        "youtube": artist.youtube,
        "twitch": artist.twitch,
        "soundcloud": artist.soundcloud,
        "mixcloud": artist.mixcloud,
        "user_id": artist.user_id
    })

# Delete an artist
@app.route("/artists/<int:artist_id>", methods=["DELETE"])
def delete_artist(artist_id):
    artist = Artist().GetByID(artist_id)

    if not artist:
        # If we don't have an artist, return a 404 error
        return json.dumps({"error": "Artist not found"}), 404

    artist.Delete()
    return json.dumps({"message": "Artist deleted successfully"})

# Get all users
@app.route("/users", methods=["GET"])
def get_users():
    users = User().GetAllUsers()
    return json.dumps([{
        "id": user.id,
        "username": user.username
    } for user in users])

# Create a new user
@app.route("/users", methods=["POST"])
def create_user():
    print("Creating user...")
    
    # Get the JSON data from the request and create a new User object
    data = json.loads(request.get_data())
    print(data)
    user = User()
    user.username = data['arg'].get("username") 
    user.password = data['arg'].get("password")

    user.CreateUser()

    # serialize the user object to JSON and return it with a 201 status code
    return json.dumps({
        "id": user.id,
        "username": user.username
    }), 201

# Get user by username
@app.route("/users/<string:username>", methods=["GET"])
def get_user(username):
    user = User().GetUserByUsername(username)

    # Convert User objects to dictionaries for JSON serialization
    if user:
        # If we have a user, return it as JSON
        return json.dumps({
            "id": user.id,
            "username": user.username
        })
    else:
        # If we don't have a user, return a 404 error
        return json.dumps({"error": "User not found"}), 404
    
# Get user by ID
@app.route("/users/id/<int:user_id>", methods=["GET"])
def get_user_by_id(user_id):
    user = User().GetUserByID(user_id)

    # Convert User objects to dictionaries for JSON serialization
    if user:
        # If we have a user, return it as JSON
        return json.dumps({
            "id": user.id,
            "username": user.username
        })
    else:
        # If we don't have a user, return a 404 error
        return json.dumps({"error": "User not found"}), 404
    
# Update an existing user
@app.route("/users/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    # Get the existing user by ID
    user = User().GetUserByID(user_id)
    
    if not user:
        # If we don't have a user, return a 404 error
        return json.dumps({"error": "User not found"}), 404

    # Get the JSON data from the request and update the User object
    data = json.loads(request.get_data())

    user.username = data.get("username", user.username)
    user.password = data.get("password", user.password)

    user.Save()

    # serialize the updated user object to JSON and return it
    return json.dumps({
        "id": user.id,
        "username": user.username
    })

# Authenticate a user
@app.route("/users/authenticate", methods=["POST"])
def authenticate_user():
    print("Authenticating user...")
    
    # Get the JSON data from the request and create a new User object
    data = json.loads(request.get_data())
    print(data)
    username = data['arg'].get("username") 
    password = data['arg'].get("password")

    user = User().Authenticate(username, password)

    if user:
        return json.dumps({
            "id": user.id,
            "username": user.username
        })
    else:
        return json.dumps({"error": "Invalid username or password"}), 401
    
if __name__ == '__main__':
    app.run(debug=True)