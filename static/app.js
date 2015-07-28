"use strict";

const COOKIE_USER = 'user';

$(document).ready(function () {

  var _user; // string identifier for me
  var _socket; // WebSocket
  var _convos = {}; // conversations I am having or with people who are online
  var _online_users = []; // users that are online
  var _selected_convo = null; // currently selected convo from _convos
  var $window = $(window); // browser window
  var $list = $('#list'); // left side conversation list
  var $list_title = $('#list_title'); // left side list title
  var $detail = $('#detail'); // right side container of conversation
  var $detail_title = $('#detail_title'); // right side conversation title
  var $input = $('#input'); // input box

  function setup_resize_listener() {
    $window.resize(function() {
      $list.height($window.outerHeight() - $list_title.outerHeight());
      resize_detail();
    });
  }

  function resize_detail() {
    $detail.height($window.outerHeight() - $detail_title.outerHeight() - $input.outerHeight());
  }

  function setup_user() {
    _user = window.location.pathname.substr(1);
    if (!_user) {
      _user = getUser();
      _user = promptUser(_user);
      history.pushState(null, null, '/' + _user);
    }
    $('#list_title').text(_user + '\'s Conversations');
  }

  function setup_socket() {
    _socket = new WebSocket('ws://jaslong.com:8888/socket/' + _user);
    _socket.send_json = function (json) {
      this.send(JSON.stringify(json));
    };
    _socket.onmessage = function (event) {
      console.log(event.data);
      var data = JSON.parse(event.data);

      // received past conversation list
      if (data.conversations) {
        for (let user in data.conversations) {
          console.log('adding past conversation for ' + user);
          add_convo(user, data.conversations[user].messages);
        }
      }

      // received updated list of online users
      // find the ones we don't know about yet and add them to the conversation list
      if (data.online_users) {
        _online_users = data.online_users;
        var current_users = Object.keys(_convos);
        for (let i in _online_users) {
          var user = _online_users[i];
          if (user != _user && current_users.indexOf(user) < 0) {
            add_convo(user, []);
          }
        }
      }

      // received message
      if (data.from && data.to && data.message) {
        var user = data.from === _user ? data.to : data.from;
        if (user) {
          add_convo_message(user, data);
        }
      }

      // received typing
      if (data.from && data.to && 'typing' in data) {
        set_convo_typing(data.from, data.typing);
      }

    };
  }

  function setup_input() {
    // focus on clicking anywhere on the conversation
    $detail.click(function () {
      $input.focus();
    });

    // if user pressed enter && there's a message,
    // then send the message and clear the input
    $input.keypress(function (event) {
      if (event.which == 13) {
        var message = $input.val();
        if (message) {
          _socket.send_json({
            from: _user,
            to: _selected_convo.user,
            message: message,
          });
          $input.val('');
        }
        return false;
      }
    });

    // tell the other user you're typing
    $input.on('input', function () {
      _socket.send_json({
        from: _user,
        to: _selected_convo.user,
        typing: new Boolean($input.val()),
      });
    });
  }

  function add_convo(user, messages) {
    // create the structures and UI
    var $link = $('<div class="list_link"><div class="list_user">' + user + '</div></div>');
    var $last_message = $('<div class="list_last_message"></div>');
    $link.append($last_message);
    var convo = {
      user: user,
      $link: $link,
      $last_message: $last_message,
      $convo: $('<div class="conversation"></div>'),
    };
    convo.$link.click(function () {
      select_convo(this);
    }.bind(convo));

    // append to the conversation list
    $list.append(convo.$link);

    // add to map of conversations
    _convos[user] = convo;

    // maybe select it
    if (!_selected_convo) {
      select_convo(convo);
    }

    // append past messages and remove updated color
    for (let i in messages) {
      add_convo_message(user, messages[i]);
    }
    convo.$link.removeClass('updated')
  }

  function add_convo_message(user, data) {
    // create message
    var text = data.from + ': ' + data.message;
    var $message = $('<div class="message">' + text + '</div>');
    var is_me = data.from === _user;
    if (!is_me) {
      $message.addClass('incoming_message');
    }

    // add it to the conversation div
    var convo = _convos[user];
    if (convo.$typing) { // if other user is typing
      if (is_me) { // if it's me, put it before the typing
        convo.$typing.before($message);
      } else { // if it's the other user, they're done typing, so replace it
        convo.$typing.replaceWith($message);
        convo.$typing = null;
      }
    } else { // if other user is not typing
      convo.$convo.append($message);
    }
    convo.$link.addClass('updated'); // give it a color to notify it's updated
    convo.$last_message.text(text); // update the last message in the conversation list

    $detail.scrollTop($detail[0].scrollHeight); // scroll to bottom
  }

  function set_convo_typing(user, typing) {
    var convo = _convos[user];
    if (typing && !convo.$typing) {
      convo.$typing = $('<div class="typing">' + user + ' is typing&#x2026</div>');
      convo.$convo.append(convo.$typing);
      $detail.scrollTop($detail[0].scrollHeight);
    } else if (!typing && convo.$typing) {
      convo.$typing.remove();
      convo.$typing = null;
    }
  }

  function select_convo(convo) {
    if (_selected_convo) {
      _selected_convo.$link.removeClass('selected updated');
    }
    _selected_convo = convo;

    _selected_convo.$link.removeClass('updated');
    _selected_convo.$link.addClass('selected');
    $detail_title.text(_selected_convo.user);
    $detail.empty();
    $detail.append(_selected_convo.$convo);
    $input.focus();

    resize_detail();
  }

  // Start

  setup_resize_listener();
  setup_user();
  setup_socket();
  setup_input();

  $window.trigger('resize');

});

function promptUser(oldUser) {
  var user;
  while (!user) {
    user = window.prompt('What\'s your name?', oldUser ? oldUser : '').trim();
  }
  setCookie(COOKIE_USER, user);
  return user;
}

function getUser() {
  return getCookie(COOKIE_USER);
}

function setCookie(name, value, days) {
  var expires;

  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toGMTString();
  } else {
    expires = "";
  }
  document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + expires + "; path=/";
}

function getCookie(name) {
  var nameEQ = encodeURIComponent(name) + "=";
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return null;
}

function removeCookie(name) {
  setCookie(name, "", -1);
}
