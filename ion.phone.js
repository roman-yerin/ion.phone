/** @license

Copyright (C) 2017, Roman Yerin <sale@ion.team>

This file is part of Ion.Phone.

Ion.Phone is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, version 3 of the License.

Ion.Phone is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with Ion.Phone.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

function checkRTC(){
  var isMobileDevice = !!(/Android|webOS|iPhone|iPad|iPod|BB10|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(navigator.userAgent || ''));

  var isEdge = navigator.userAgent.indexOf('Edge') !== -1 && (!!navigator.msSaveOrOpenBlob || !!navigator.msSaveBlob);

  var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
  var isFirefox = typeof window.InstallTrigger !== 'undefined';
  var isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;
  var isChrome = !!window.chrome && !isOpera;
  var isIE = !!document.documentMode && !isEdge;

  var isWebRTCSupported = false;
  ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection'].forEach(function(item) {
    if (isWebRTCSupported) {
      return;
    }

    if (item in window) {
      isWebRTCSupported = true;
    }
  });
  return isWebRTCSupported;
}

function getXmlHttp(){
  var xmlhttp;
  try {
    xmlhttp = new ActiveXObject("Msxml2.XMLHTTP");
  } catch (e) {
    try {
      xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    } catch (E) {
      xmlhttp = false;
    }
  }
  if (!xmlhttp && typeof XMLHttpRequest!='undefined') {
    xmlhttp = new XMLHttpRequest();
  }
  return xmlhttp;
}

var ionCall = class ionCall {
	constructor(){
		this.isMuted = false;
	}
	get id(){
		return this.session?this.session.id:'-dummy';
	}
	
	get session(){
		return this._session;
	}
	set session( _session ){
		var $self = this;
		this._session = _session;

		_session.on('terminated', function(message, cause) {
			$self.onDestroy( cause );
			$self.terminated = true;
			$self.onStatusChange();
		});

		_session.on('progress', function(message, cause) {
			$self.onStatusChange();
		});

		_session.on('accepted', function(message, cause) {
			$self.answered = true;
			$self.onStatusChange();
		});

		_session.on('muted', function(message, cause) {
			$self.isMuted = true;
			$self.onStatusChange();
		});

		_session.on('unmuted', function(message, cause) {
			$self.isMuted = false;
			$self.onStatusChange();
		});


	}

	get direction(){
		return this._direction;
	}
	set direction( _direction ){
		this._direction = _direction;
	}

	static fromSession( session, onDestroy ){
		var call = new ionCall();
		call.session = session;
		call.onDestroy = onDestroy || function () {
		};

		return call;
	}

	addAudio(){

		var audio = document.createElement('audio');
		audio.autoplay = true;
		//audio.style = 'display:none';
		document.body.appendChild(audio);
		this.audio = audio;
	}

	removeAudio(){
		document.body.removeChild(this.audio);
	}


	// Events

	onStatusChange(){

	}

	// Methods

	answer(){
		this.session.accept({
			media: {
				render: { remote: this.audio },
				constraints: {                                                                                                                                                            
                	audio: true,                                                                                                                                                             
                	video: false                                                                                                                                                             
                } 
			}
		});
	}

	hangup(){
		this.session.terminate();
	}

	mute( flag ){
		if (flag === undefined) return this.isMuted;
		if (flag) this.session.mute();
		else this.session.unmute();
	}

	volume( vol ){
		if(vol == undefined) return this.audio.volume*100;
		this.audio.volume = vol/100;
	}
}

var ionPhone = class ionPhone {
	constructor( settings ){

		if ( SIP === undefined ) { throw new Error("SIP.js is not loaded"); }
		if ( !settings || !settings.connection || !settings.connection.wss ) { throw new Error("Connection settings are not provided") }

		this.settings = settings;

    if (!checkRTC()){ this.unsupported = true; this.render(); return; }


		if (settings.display.ring) {
			var audio = document.createElement('audio');
			audio.autoplay = false;
			audio.src = settings.display.ring;
			audio.loop = true;
			//audio.style = 'display:none';
			document.body.appendChild(audio);
			this.ring = audio;
		}
		
		var $self = this;
		$self.calls = [];

		$self.ua = new SIP.UA({
			uri: settings.connection.identity || 'anonymous@invalid',
			wsServers: [ settings.connection.wss ],
			register: settings.connection.register,
			password: settings.connection.password,
			userAgentString: 'ionPhone/1',
			wsServerMaxReconnection: 100
		});
		
		$self.ua.on('connecting', function (args) {
			$self.onConnecting(args.attempts);
			$self.render();
		});
		$self.ua.on('connected', function () {
			$self.onConnect();
			$self.render();
		});
		$self.ua.on('disconnected', function () {
			$self.onDisconnect();
			$self.render();
		});
		$self.ua.on('registered', function () {
			$self.onRegister();
			$self.render();
		});
		$self.ua.on('unregistered', function (response, cause) {
			$self.onUnregister();
			$self.render();
		});
		$self.ua.on('registrationFailed', function (cause, response) {
			$self.onRegistrationFailed( cause );
			$self.render();
		});
		$self.ua.on('invite', function (session) {
			var call = ionCall.fromSession(session, function () {
				var i = $self.calls.findIndex(function (el, index, array) {
					return call.id === el.id;
				});
				if ( i < 0 ) 
					{ console.warn("Destroyed call was not found in queue"); }
				else $self.calls.splice(i,1);
				call.removeAudio();
			});
			call.direction = 'inbound';
			call.addAudio();
			call.onStatusChange = function () {
				if ($self.ring && (call.answered || call.terminated)) {
					$self.ring.pause();
					$self.ring.currentTime = 0;
				}
				$self.render();
			};
			$self.calls.push(call);
			$self.onCall(call);
			if ($self.ring) $self.ring.play();
			$self.render();
		});

		$self.render();
	}

	render(){
		var $self = this;
		if (!this.settings.display || !this.settings.display.element) { return; }
		var phone = document.getElementById(this.settings.display.element);
		if (!phone) return;
		if (!document.getElementById('ionPhoneStyle')){
			var styles = document.createElement('style');
			styles.id = 'ionPhoneStyle';
			var text = '.ionWrapper {width:200px;min-height:300px;background:#efefef}';
			text += '.ionDialpad {text-align:center;margin-bottom:10px}';
			text += '.ionDialpadLetter {margin:1px 1px 0 0;font-size:14pt;width:48px;height:48px;border:1px solid #bcd;background:#fff;border-radius:50%;outline:none !important;}';
			text += '.ionNumber input{box-sizing: border-box;margin:0;border-radius:3px 0 0 3px;font-size:14pt;width:120px;height:32px;padding:0 0 0 5px;line-height: 32pt;border:none;vertical-align:bottom;border:1px solid #bcd;border-width:1px 0 1px 1px}';
			text += '.ionNumber {text-align:center;margin-bottom:10pt;}';
			text += '.ionDialpadDial {width:48px;height:48px;margin-top:4px;background:#396;border-radius:50%;color:white;border:0px solid white;font-family:Sans;outline:none !important;text-align:center}';
			text += '.ionDialpadDial:disabled {background:gray}'
			text += '.ionHeader {min-height:24pt}';
			text += '.ionStatus {min-height:24pt}';
			text += '.ionCall {padding:5pt;border:1px solid white;margin:0 5px 0 5px;border-radius:0;}';
			text += '.ionCall.outbound {background:#fed;color:brown;}';
			text += '.ionCall.inbound {background:#fed;color:brown;}';
			text += '.ionAnswerButton {background:green;color:white;border:1px solid white;border-radius:3pt;margin-right:2px;}';
			text += '.ionHangupButton {background:red;color:white;border:1px solid white;border-radius:3pt;margin-right:2px;}';
			text += '.ionMuteButton.true {background:orange;color:white;border:1px solid white;border-radius:3pt}';
			text += '.ionMuteButton.false {background:gray;color:white;border:1px solid white;border-radius:3pt}';
			text += '.ionVolumeSlider {margin-right:auto;margin-left:auto}';
			text += '.ionUnsupported {text-align:center;padding:5px;padding-top:40%}';
			text += '.ionBackspaceButton {border-radius:0 3px 3px 0;background:#fff;font-size:10pt;padding:0;height:32px;width:20px;line-height: 10pt;border:1px solid #bcd;border-width:1px 1px 1px 0;outline:none}';
			text += 'input[type=range] {  -webkit-appearance: none;  width: 100%;  margin: 7.5px 0;}input[type=range]:focus {  outline: none;}input[type=range]::-webkit-slider-runnable-track {  width: 100%;  height: 5px;  cursor: pointer;  box-shadow: 0px 0px 0px #000000, 0px 0px 0px #0d0d0d;  background: #fb3068;  border-radius: 0px;  border: 0px solid #010101;}input[type=range]::-webkit-slider-thumb {  box-shadow: 0px 0px 0px #f70000, 0px 0px 0px #ff1212;  border: 1px solid #d20000;  height: 20px;  width: 8px;  border-radius: 0px;  background: #ffffff;  cursor: pointer;  -webkit-appearance: none;  margin-top: -7.5px;}input[type=range]:focus::-webkit-slider-runnable-track {  background: #fb3a6f;}input[type=range]::-moz-range-track {  width: 100%;  height: 5px;  cursor: pointer;  box-shadow: 0px 0px 0px #000000, 0px 0px 0px #0d0d0d;  background: #fb3068;  border-radius: 0px;  border: 0px solid #010101;}input[type=range]::-moz-range-thumb {  box-shadow: 0px 0px 0px #f70000, 0px 0px 0px #ff1212;  border: 1px solid #d20000;  height: 20px;  width: 8px;  border-radius: 0px;  background: #ffffff;  cursor: pointer;}input[type=range]::-ms-track {  width: 100%;  height: 5px;  cursor: pointer;  background: transparent;  border-color: transparent;  color: transparent;}input[type=range]::-ms-fill-lower {  background: #fb2661;  border: 0px solid #010101;  border-radius: 0px;  box-shadow: 0px 0px 0px #000000, 0px 0px 0px #0d0d0d;}input[type=range]::-ms-fill-upper {  background: #fb3068;  border: 0px solid #010101;  border-radius: 0px;  box-shadow: 0px 0px 0px #000000, 0px 0px 0px #0d0d0d;}input[type=range]::-ms-thumb {  box-shadow: 0px 0px 0px #f70000, 0px 0px 0px #ff1212;  border: 1px solid #d20000;  height: 20px;  width: 8px;  border-radius: 0px;  background: #ffffff;  cursor: pointer;  height: 5px;}input[type=range]:focus::-ms-fill-lower {  background: #fb3068;}input[type=range]:focus::-ms-fill-upper {  background: #fb3a6f;} input[type=range]:disabled::-webkit-slider-runnable-track {background:gray} input[type=range]:disabled::-moz-range-track {background:gray} input[type=range]:disabled::-ms-track {background:gray}';

			styles.innerHTML = text;
			document.getElementsByTagName("head")[0].insertBefore(styles,document.getElementsByTagName("head")[0].firstChild);
		}
		phone.className = 'ionWrapper';
		var header = '';
		var number = '';
		var dialpad = '';
		var footer = '';
		var status = '';
    if ($self.unsupported) {phone.innerHTML = '<div class="ionUnsupported"><h3>Not supported</h3>Your browser is not supported<br>Please use either Firefox or Chrome</div>'; return;}
		if (phone.firstChild) {
			// Set UI state
			header = phone.getElementsByClassName('ionHeader')[0];
			number = phone.getElementsByClassName('ionNumber')[0];
			dialpad = phone.getElementsByClassName('ionDialpad')[0];
			footer = phone.getElementsByClassName('ionFooter')[0];
			status = phone.getElementsByClassName('ionStatus')[0];
		} else {
			// Create UI
			header = document.createElement('div');
			header.className = 'ionHeader';
			phone.appendChild(header);
			number = document.createElement('div');
			number.className = 'ionNumber';
			number.appendChild(document.createElement('input'));
			var btn = document.createElement('button');
			btn.className = 'ionBackspaceButton';
			btn.innerHTML = '⌫';
			btn.onclick = function () {
				number.getElementsByTagName('input')[0].value = number.getElementsByTagName('input')[0].value.replace(/.$/,"");
				$self.render();
				return false;
			};
			number.appendChild(btn);
			phone.appendChild(number);

			number.getElementsByTagName('input')[0].oninput = function () {
				this.value = this.value.replace(/[^\+0-9]/g,'');
				$self.render();
			}


			function dialpadClick() {
				number.getElementsByTagName('input')[0].value += this.innerHTML;
				$self.render();
				return false;
			}
			dialpad = document.createElement('div');
			dialpad.className = 'ionDialpad';
			if ($self.settings.display && $self.settings.display.dialpad) {
				for (var i = 1; i <= 9; i++) {
					var btn = document.createElement('button');
					btn.innerHTML = i;
					btn.className = 'ionDialpadLetter';
					btn.onclick = dialpadClick;
					dialpad.appendChild(btn);
					if (i%3 == 0) dialpad.appendChild(document.createElement('br'));
				}
				var btn = document.createElement('button');
				btn.innerHTML = '*';
				btn.onclick = dialpadClick;
				btn.className = 'ionDialpadLetter';
				dialpad.appendChild(btn);
				btn = document.createElement('button');
				btn.innerHTML = '0';
				btn.onclick = dialpadClick;
				btn.className = 'ionDialpadLetter';
				dialpad.appendChild(btn);
				btn = document.createElement('button');
				btn.innerHTML = '#';
				btn.onclick = dialpadClick;
				btn.className = 'ionDialpadLetter';
				dialpad.appendChild(btn);
			}
			phone.appendChild(dialpad);
			footer = document.createElement('div');
			footer.className = 'ionFooter';
			phone.appendChild(footer);
			status = document.createElement('div');
			status.className = 'ionStatus';
			phone.appendChild(status);
			
			dialpad.appendChild(document.createElement('br'));
      var img = document.createElement('img');
      img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAABtUlEQVRIia2VP2sUURRH7xsGWZYU';
      img.src += 'VkEsU4iIyBZi4edIEfwEFmKR0s5CLKxkSwsLSwliIRaWlmKhrUJcli1UgqRc455jkdl1nMzsLDO5';
      img.src += 'MHDhPe6573f/TEREAAP1ifpL/aDeiPMyYAA8Uxf+sxkwUvsD1GvqkSqwIgBTYHQegAvqc2AFWPrA';
      img.src += 'TL3ZF/CuIk/VpuqVPoBJOesGe6vmXeJn6o8aaCwLXPgXuz4gSyl9jYhIKUVKKWr83ymlcUT86URQ';
      img.src += '9+s0KeQ6Ufe7Zh8REcAtdV7toiL4nV7B41SizxHxrSpRROQR0Vn7/wx4VCcRMFEv9waoO8BxddAK';
      img.src += '/0DN+gIyYNwwAwvgYdMcqAHkrUkA28DPho46UWshwJ76HnijXm17yR5wpqOKbwG8BC6Vgt8r32/d';
      img.src += 'XWpeSLVuNx0Cd9VddV5zPlNHQCNkS33dFL20r+aV9V6+NnHdT0sdqK8KWc7ItYkPTNsgW+rTBhk2';
      img.src += 'tY9tRc89Lfyqu5pkafCP1wJKoG1gvGYYy0GXsi7U8UaAApKpO+pj9UuDdIfqLnCkvgCGGwMqsKF6';
      img.src += 'G3igHqifgO/q/eL8ujqMiPgLNdbjt11/zWgAAAAASUVORK5CYII=';

			btn = document.createElement('button');
      btn.appendChild(img);
			btn.className = 'ionDialpadDial';
			btn.onclick = function (argument) {
				$self.call(number.getElementsByTagName('input')[0].value);
				var dial_number = number.getElementsByTagName('input')[0];
				dial_number.value = '';
        $self.render();
			};
			dialpad.appendChild(btn);

		}
		var dial_btn = dialpad.getElementsByClassName('ionDialpadDial')[0];
		var dial_number = number.getElementsByTagName('input')[0];
		dial_btn.disabled = (dial_number.value == '');
		footer.innerHTML = '';
		for (var i = $self.calls.length - 1; i >= 0; i--) {
			var session = $self.calls[i].session;
			var pan = document.createElement('div');
			var call = $self.calls[i];

			pan.className = 'ionCall';
			pan.className += ' ' + call.direction;
			if ($self.calls[i].direction == 'outbound')
				pan.innerHTML = '=> ' + this.resolveName(session.request.to.friendlyName.replace(/@.*$/,""));
			else 
				pan.innerHTML = '<= ' + this.resolveName(session.request.from.friendlyName.replace(/@.*$/,""));
			pan.appendChild(document.createElement('br'));

			var vol_input = document.createElement('input');
			vol_input.type = 'range';
			vol_input.max = 100;
			vol_input.min = 0;
			vol_input.value = call.volume();
			vol_input.className = 'ionVolumeSlider';
			vol_input.disabled = !call.answered;
			vol_input.oninput = function (event) {
				call.volume(vol_input.value);
			}
			pan.appendChild(vol_input);

			var btn = document.createElement('button');
			btn.innerHTML = 'Hangup';
			btn.onclick = function () {
				call.hangup();
			}
			btn.className = 'ionHangupButton';
			pan.appendChild(btn);

			if(!call.answered && call.direction == 'inbound'){
				var btn = document.createElement('button');
				btn.innerHTML = 'Answer';
				btn.onclick = function () {
					call.answer();
				}
				btn.className = 'ionAnswerButton';
				pan.appendChild(btn);
			}

			if(call.answered){
				btn = document.createElement('button');
				btn.innerHTML = 'Mute';
				btn.title = 'Mute/Unmute';
				btn.onclick = function () {
					call.mute(!call.mute());
				}
				btn.className = 'ionMuteButton ' + call.mute();
				pan.appendChild(btn);
			}

			footer.appendChild(pan);
		}
	}

// Methods

	call( number ){
		var $self = this;

		var call = new ionCall();
		call.addAudio();

		var session = $self.ua.invite(number,{
			media: {
				render: { remote: call.audio },
				constraints: {                                                                                                                                                            
                	audio: true,                                                                                                                                                             
                	video: false                                                                                                                                                             
                } 
			}

		});
		call.session = session;

		call.onDestroy = function () {
			var i = $self.calls.findIndex(function (el, index, array) {
				return call.id === el.id;
			});
			if ( i < 0 ) 
				{ console.warn("Destroyed call was not found in queue"); }
			else $self.calls.splice(i,1);
			call.removeAudio();
		};

		call.direction = 'outbound';
		call.onStatusChange = function () {
			$self.render();
		};
		$self.calls.push(call);
	}

	resolveName(number){
		return number;
	}

// Events

	onConnecting( attempt ){

	}
	onConnect(){

	}
	onDisconnect(){

	}
	onRegister(){

	}
	onUnregister(){

	}
	onRegistrationFailed( cause ){

	}
	onCall( call ){
		
	}


}
