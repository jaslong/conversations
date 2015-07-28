import json

from datetime import datetime

# Manages transfer of data between users and their clients.
class Manager:

    def __init__(self):
        self.clients = {} # user -> ClientConnection
        self.conversation_store = ConversationStore()

    def get_users(self):
        return self.clients.keys()

    def connect(self, client):
        log('connect: ' + client.user)
        if client.user not in self.clients:
            self.clients[client.user] = []
        self.clients[client.user].append(client)
        client.send_data({ 'conversations': self.conversation_store.get_for_user(client.user) })
        self.broadcast_users()

    def disconnect(self, client):
        log('disconnect: ' + client.user)
        clients = self.clients[client.user]
        clients.remove(client)
        if not clients:
            del self.clients[client.user]
        self.broadcast_users()

    def broadcast_users(self):
        for clients in self.clients.values():
            for client in clients:
                client.send_data({ 'online_users': self.get_users() })

    def handle_message(self, client, data):
        to_user = data['to']
        conversation = self.conversation_store.get(client.user, to_user)
        conversation['messages'].append(data)

        for user in conversation['users']:
            self.send_to(user, data)

    def handle_typing(self, client, data):
        to_user = data['to']
        self.send_to(data['to'], data)

    def send_to(self, user, data):
        if user in self.clients:
            for client in self.clients[user]:
                client.send_data(data)

# Stores conversations and provides fast access to them for each user or pair of users.
# A conversation is a dict structure with a list of users and a list of messages.
class ConversationStore:

    def __init__(self):
        self.store = {} # multi-level dict: user -> (user -> conversation)

    def get(self, user1, user2):
        try:
            return self.store[user1][user2]
        except:
            # conversation does no exist, so create a new one
            conversation = {
                'users': [user1, user2],
                'messages': [],
                }

            if user1 not in self.store:
                self.store[user1] = {}
            if user2 not in self.store:
                self.store[user2] = {}
            self.store[user1][user2] = conversation
            self.store[user2][user1] = conversation

            return conversation

    def get_for_user(self, user):
        try:
            return self.store[user]
        except:
            return {}

# Abstraction for a user's connection to a client.
# A ClientConnection has one user, but a user may have many clients ClientConnections.
class ClientConnection:

    def __init__(self, socket, manager, user):
        self.socket = socket
        self.manager = manager
        self.user = user
        self.manager.connect(self)

    def on_receive_data(self, data):
        log('receive from {0}: {1}'.format(self.user, str(data)));
        if 'from' in data and 'to' in data:
            if 'message' in data:
                self.manager.handle_message(self, data)
                return
            elif 'typing' in data:
                self.manager.handle_typing(self, data)
                return
        log('invalid data: {0}'.format(str(data)))

    def on_close(self):
        self.manager.disconnect(self)

    def send_data(self, data):
        log('send to {0}: {1}'.format(self.user, str(data)));
        self.socket.write_message(data)

def log(message):
    print('{0} {1}'.format(str(datetime.now()), message))
