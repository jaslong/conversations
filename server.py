import json
import os.path

from tornado.ioloop import IOLoop
from tornado.web import RequestHandler, Application, url
from tornado.websocket import WebSocketHandler

from manager import ClientConnection, Manager

class AppHandler(RequestHandler):
    def get(self):
        self.render('app.html')

class SocketHandler(WebSocketHandler):
    def initialize(self, manager):
        self.manager = manager
        self.client_connection = None

    def open(self, user):
        self.client_connection = ClientConnection(self, self.manager, user)

    def on_message(self, json_data):
        data = json.loads(json_data)
        self.client_connection.on_receive_data(data)

    def on_close(self):
        if self.client_connection:
            self.client_connection.on_close()

    def write_message(self, data):
        json_data = json.dumps(data)
        super(SocketHandler, self).write_message(json_data)

def make_app():
    manager = Manager();

    return Application(
        handlers=[
            (r'/socket/(.+)', SocketHandler, dict(manager=manager)),
            (r'/.*', AppHandler),
            ],
        cookie_secret='dNRvM0qzS2WPtUa6fYkZHOOrzbgKWUBmr3oeJW/X+C4=',
        template_path=os.path.join(os.path.dirname(__file__), 'templates'),
        static_path=os.path.join(os.path.dirname(__file__), 'static'),
        #xsrf_cookies=True,
        autoescape='xhtml_escape',
        debug=True, # for server auto-reload
        )

def main():
    app = make_app()
    app.listen(8888)
    IOLoop.current().start()

main()
