self.__scramjet$config = {
  prefix: '/scramjet/service/',
  codec: 'plain',
  wispUrl: (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/wisp/',
};
