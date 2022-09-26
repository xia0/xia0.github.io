/**
* Gets run when js file from Spotify is loaded?
*/
function onSpotifyWebPlaybackSDKReady() {

  if (access_token == null) return;

  const player = new Spotify.Player({
      name: 'Web Playback SDK Quick Start Player',
      getOAuthToken: cb => { cb(access_token); },
      volume: 0.5
  });

  // Ready
  player.addListener('ready', ({ device_id }) => {
      console.log('Ready with Device ID', device_id);
      $.ajax({
        url: 'https://api.spotify.com/v1/me/player',
        type: 'PUT',
        headers: {
          'Authorization' : 'Bearer ' + access_token
        },
        data: '{"device_ids": ["'+device_id+'"]}',
        success: function(data) {
          console.log("Successfully transferred playback");
        }
      });
  });

  // Not Ready
  player.addListener('not_ready', ({ device_id }) => {
      console.log('Device ID has gone offline', device_id);
  });

  player.addListener('initialization_error', ({ message }) => {
      console.error(message);
  });

  player.addListener('authentication_error', ({ message }) => {
      console.error(message);
  });

  player.addListener('account_error', ({ message }) => {
      console.error(message);
  });

  document.getElementById('togglePlay').onclick = function() {
    player.togglePlay();
  };

  /*
  function playerPause() {
    player.pause().then(() => {
      console.log('Paused!');
    });
  }*/



  player.connect();
}

// Your client id from your app in the spotify dashboard:
// https://developer.spotify.com/dashboard/applications
const client_id = '43a22aa24295448faec97a2636493a7d';
const redirect_uri = 'http://127.0.0.1/spotify-trivia/'; // Your redirect uri
//const redirect_uri = 'https://xia0.github.io/spotify-trivia/'; // Your redirect uri

// Restore tokens from localStorage
let access_token = localStorage.getItem('access_token') || null;
let refresh_token = localStorage.getItem('refresh_token') || null;
let expires_at = localStorage.getItem('expires_at') || null;

let default_end_time = 30*1000;

let has_opened_playlist = false;

var playlistData = [];
var user_id = "";
var selected_playlist_id = "";
var selected_playlist_index = -1;
var selected_playlist_data = [];
var tracks_data = [];
var timerSave;
var timerPause;
var timerPlay;
var intervalProgress;

let playStartTime = 0;
let sliderDifference = 0;

// Update token if current one is expired
if (expires_at < Date.now()) {
  refreshToken();
}
else { // Otherwise, set a timeout to fetch new token before expiry
  let interval = expires_at - Date.now() - 60*1000;
  setTimeout(refreshToken, interval);
}


$( document ).ready(function() {
  console.log( "ready!" );
  //console.log(token);
  // References for HTML rendering
  const mainPlaceholder = document.getElementById('main');
  const oauthPlaceholder = document.getElementById('oauth');

  // If the user has accepted the authorize request spotify will come back to your application with the code in the response query string
  // Example: http://127.0.0.1:8080/?code=NApCCg..BkWtQ&state=profile%2Factivity
  const args = new URLSearchParams(window.location.search);
  const code = args.get('code');

  if (code) {
    // we have received the code from spotify and will exchange it for a access_token
    exchangeToken(code);
  } else if (access_token && refresh_token && expires_at) {
    // we are already authorized and reload our tokens from localStorage
    document.getElementById('loggedin').style.display = 'unset';

    oauthPlaceholder.innerHTML = oAuthTemplate({
      access_token,
      refresh_token,
      expires_at,
    });

    getUserData();
  } else {
    // we are not logged in so show the login button
    document.getElementById('login').style.display = 'unset';
  }

  document
    .getElementById('login-button')
    .addEventListener('click', redirectToSpotifyAuthorizeEndpoint, false);

  document
    .getElementById('refresh-button')
    .addEventListener('click', refreshToken, false);
  //setInterval(refreshToken, 1000*60*10);
  //refreshToken();

  document
    .getElementById('logout-button')
    .addEventListener('click', logout, false);

  // Stop any autoplay timer when autopilot checkbox is manipulated
  $("#autopilot").click(function(){
    //pauseTrack();
  });

  // Reset start and end times when reset button is clicked
  $("#button-reset-time").click(function(){
    $(".slider").slider( "values", 0, 0 );
    $(".slider").slider( "values", 1, default_end_time );
    //$(".time-start").val(0);
    //$(".time-end").val(default_end_time);

    // Update our text too
    for (let i = 0; i < $(".slider").length; i++) {
      updateTimeDescriptions(i, 0, default_end_time);
    }

    saveTimes(0);
  });

  $('#button-close-playlist').click(function() {
    parent.location.hash = '';

    // Stop any currently playing tracks
    clearTimeout(timerPause);
    clearTimeout(timerPlay);
    pauseTrack();

    // Restore playlists view
    $('#playlists-container').show();
    $('#tracks-container').animate({
      left: '-100%'
    });

  });

  $('#button-open-spotify').click(function() {
    window.open(playlistData[selected_playlist_index].external_urls.spotify, '_blank').focus();
  });



  // Filter field
  $('#filter').val("");
  $('#filter').keyup(function(){
    $( ".playlist-title" ).each(function( index ) {
      if ($(this).text().toLowerCase().search( $('#filter').val().toLowerCase() ) >= 0
          || $('#filter').val() == "") $(this).closest('.playlist-item-container').show();
      else $(this).closest('.playlist-item-container').hide();
    });
  });

  $('#filter-clear').click(function() {
    $('#filter').val("").trigger('keyup');

  })

  // Save when autosave is switched on
  $("#autosave").change(function() {
    saveDescription();
  });

  // Close playlist on back button
  window.onhashchange = function() {
    if (!window.location.hash) $('#button-close-playlist').click();
  }

  // Hide loading spinner
  $('#loading-container').fadeOut();

  // Put tracks into accordion
  /*
  $( function() {
    $( "#tracks" ).accordion({
      collapsible: true,
      active: false,
      icons: false
    });
  });
  */

});

function saveTimes(delay=2000) {
  clearTimeout(timerSave);
  timerSave = setTimeout(saveDescription, delay);
}


function generateRandomString(length) {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier),
  );

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function generateUrlWithSearchParams(url, params) {
  const urlObject = new URL(url);
  urlObject.search = new URLSearchParams(params).toString();

  return urlObject.toString();
}

function redirectToSpotifyAuthorizeEndpoint() {
  const codeVerifier = generateRandomString(64);

  generateCodeChallenge(codeVerifier).then((code_challenge) => {
    window.localStorage.setItem('code_verifier', codeVerifier);

    // Redirect to example:
    // GET https://accounts.spotify.com/authorize?response_type=code&client_id=77e602fc63fa4b96acff255ed33428d3&redirect_uri=http%3A%2F%2Flocalhost&scope=user-follow-modify&state=e21392da45dbf4&code_challenge=KADwyz1X~HIdcAG20lnXitK6k51xBP4pEMEZHmCneHD1JhrcHjE1P3yU_NjhBz4TdhV6acGo16PCd10xLwMJJ4uCutQZHw&code_challenge_method=S256

    window.location = generateUrlWithSearchParams(
      'https://accounts.spotify.com/authorize',
      {
        response_type: 'code',
        client_id,
        scope: 'user-read-private user-read-email \
                playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public \
                user-read-playback-position user-read-playback-state user-read-currently-playing \
                streaming app-remote-control',
        code_challenge_method: 'S256',
        code_challenge,
        redirect_uri,
      },
    );

    // If the user accepts spotify will come back to your application with the code in the response query string
    // Example: http://127.0.0.1:8080/?code=NApCCg..BkWtQ&state=profile%2Factivity
  });
}

function exchangeToken(code) {
  const code_verifier = localStorage.getItem('code_verifier');

  fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({
      client_id,
      grant_type: 'authorization_code',
      code,
      redirect_uri,
      code_verifier,
    }),
  })
    .then(addThrowErrorToFetch)
    .then((data) => {
      processTokenResponse(data);

      // clear search query params in the url
      window.history.replaceState({}, document.title, '/');
    })
    .catch(handleError);
}

function refreshToken() {
  fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({
      client_id,
      grant_type: 'refresh_token',
      refresh_token,
    }),
  })
  .then(addThrowErrorToFetch)
  .then(processTokenResponse)
  .catch(handleError);
}

function handleError(error) {
  console.error(error);
  $("#main").innerHTML = errorTemplate({
    status: error.response.status,
    message: error.error.error_description,
  });
}

async function addThrowErrorToFetch(response) {
  if (response.ok) {
    return response.json();
  } else {
    throw { response, error: await response.json() };
  }
}

function logout() {
  localStorage.clear();
  window.location.reload();
}

function processTokenResponse(data) {
  console.log(data);

  access_token = data.access_token;
  refresh_token = data.refresh_token;

  const t = new Date();
  expires_at = t.setSeconds(t.getSeconds() + data.expires_in);

  localStorage.setItem('access_token', access_token);
  localStorage.setItem('refresh_token', refresh_token);
  localStorage.setItem('expires_at', expires_at);

  $("#oauth").innerHTML = oAuthTemplate({
    access_token,
    refresh_token,
    expires_at,
  });

  // load data of logged in user
  getUserData();
}

function getUserData() {
  fetch('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: 'Bearer ' + access_token,
    },
  })
  .then(async (response) => {
    if (response.ok) {
      return response.json();
    } else {
      throw await response.json();
    }
  })
  .then((data) => {

    console.log(data);

    // Get user's playlist if once we confirm we are logged in
    user_id = data.id;
    playlistData = [];
    getPlaylists(true);

    // Display user details
    //console.log(data);
    document.getElementById('login').style.display = 'none';
    document.getElementById('loggedin').style.display = 'unset';
    $("#main").innerHTML = userProfileTemplate(data);

    // Load the spotify player
    console.log("Attempting to load SDK player");
    //player.connect();

  })
  .catch((error) => {

    /*
    if (error.error.status == 401) {

    }
    */

    console.error(error);
    $("#main").innerHTML = errorTemplate(error.error);
  });


}

// Helper function to check if spotify web player SDK has loaded
async function waitForSpotifyWebPlaybackSDKToLoad () {
  return new Promise(resolve => {
    if (window.Spotify) {
      resolve(window.Spotify);
    } else {
      window.onSpotifyWebPlaybackSDKReady = () => {
        resolve(window.Spotify);
      };
    }
  });
};


/** Recursive function to get all the user's playlists and filter for owned ones only
*/
function getPlaylists(update = false, offset = 0, limit = 50) {

  if (offset == 0) playlistData = []; // Reset the array if starting from 0

  fetch('https://api.spotify.com/v1/me/playlists?limit=' + limit + '&offset=' + offset, {
    headers: {
      Authorization: 'Bearer ' + access_token,
    },
  })
    .then(async (response) => {
      if (response.ok) {
        return response.json();
      } else {
        throw await response.json();
      }
    })
    .then((data) => {
      //console.log(data.items);
      playlistData = playlistData.concat(data.items);
      //document.getElementById('login').style.display = 'none';
      //document.getElementById('loggedin').style.display = 'unset';
      //mainPlaceholder.innerHTML = userProfileTemplate(data);

      // resursive function to ensure all playlists are grabbed
      if (data.items.length == data.limit) getPlaylists(update, data.offset + data.limit, data.limit);
      else { // OK we got all the user's playlists

        // remove all playlists not owned by current user
        /*
        for (let i = 0; i < playlistData.length; i++) {
          if (playlistData[i].owner.id != user_id) {
            playlistData.splice(i, 1);
            i--;
          }
        }
        */

        console.log(playlistData);
        if (update) updatePlaylists();
      }

    })
    .catch((error) => {
      console.error(error);
      mainPlaceholder.innerHTML = errorTemplate(error.error);
    });
}

/** Generate a formatted list of playlists
*/
function updatePlaylists() {

  $("#playlists").html("");

  let playlists_content = "";
  for (let i = 0; i < playlistData.length; i++) {


    // add details regarding permissions
    let attributes = [];
    if (playlistData[i].collaborative) attributes.push('<span class="material-symbols-rounded" title="Collaborative">group</span>');

    if (playlistData[i].owner.id == user_id) attributes.push('<!--<span class="material-symbols-rounded" title="Owner">edit</span>-->');
    else if (!playlistData[i].collaborative) attributes.push('<span class="material-symbols-rounded" title="Read only">edit_off</span>');

    /*
    if (!playlistData[i].public) attributes.push("Public");
    else attributes.push("Private");
    */

    let attributes_string = "";
    for (let j = 0; j < attributes.length; j++) {
      attributes_string += attributes[j];
    }


    $("#playlists").append(
      '<div class="playlist-item-container" id="playlist-'+playlistData[i].id+'">\
        <input type="hidden" class="playlist-index" value="'+i+'" />\
        <div class="playlist-image"><div class="playlist-details">'+attributes_string+'</div></div>\
        <div class="playlist-text">\
          <div class="playlist-title"><span>'+playlistData[i].name+'</span></div>\
          <div class="playlist-byline"><span>by '+playlistData[i].owner.display_name+'</span></div>\
        </div>\
      </div>'
    );

    // Replace generic image if cover art exists
    if (playlistData[i].images.length > 0) {
      $('#playlist-' + playlistData[i].id + ' > .playlist-image').css('background-image', 'url('+playlistData[i].images[playlistData[i].images.length-1].url+')');
    }




    //playlists_content += '<div class="playlist-item-container" id="'+playlistData[i].id+'">'+playlistData[i].name+'</div>';
  }
  //$("#playlists").html(playlists_content);

  // open tracks upon clicking
  // user opened a playlist
  $(".playlist-item-container").click(function(event) {
    selected_playlist_id = event.target.id.replace("playlist-", "");
    selected_playlist_index = $(this).children('.playlist-index').val();
    console.log(selected_playlist_index + '-' + selected_playlist_id);

    if (has_opened_playlist) $("#tracks").html(""); // Check to make sure a playlist wasn't loaded on refresh
    else has_opened_playlist = true;

    // Show loading spinner
    $('#loading-container').fadeIn();

    // Set the image to this playlist's art
    $('#playlist-image').css('background-image',
      $('#' + event.target.id + ' > .playlist-image').css('background-image')
    );

    // Set playlist name
    $('#tracks-playlist-title').text(
      $('#' + event.target.id + ' .playlist-title').text()
    );
    $('#tracks-playlist-byline').text(
      $('#' + event.target.id + ' .playlist-byline').text()
    );
    $('#tracks-playlist-details > div').html(
      $('#' + event.target.id + ' .playlist-details').html()
    );

    // Set the padding of the container depending on size of the header
    /*
    $('#tracks').css("padding-top", ($('#playlist-header').height() + 20) + 'px');
    */


    // Enable or disable autosave depending on if the user can write to the playlist
    if (playlistData[selected_playlist_index].collaborative ||
        playlistData[selected_playlist_index].owner.id == user_id
    ) {
      $("#autosave").prop('disabled', false);
    }
    else $("#autosave").prop('disabled', true);



    // Load data from description
    data = playlistData[$(this).index()].description.split(";");
    selected_playlist_data = [];
    for (let i = 0; i < data.length; i++) {
      let times = data[i].split(",");
      if (times.length < 2) break; // probably invalid data - leave data blank
      if (isNaN(parseInt(times[0])) || isNaN(parseInt(times[1]))) break; // comma exists but not int values
      selected_playlist_data[i] = [ parseInt(times[0]), parseInt(times[1]) ];
    }
    //console.log(selected_playlist_data);

    // Load tracks from playlist

    getTracks(selected_playlist_id);


    $(location).attr('hash', event.target.id.replace("playlist-", "")); // Set the location hash to this id
  });

  // If hash attribute already exists in URL, open up that preadylaylist
  if ($(location).attr('hash') && !has_opened_playlist) {
    $( $(location).attr('hash').replace("#", "#playlist-") ).click();
  }
}


/** Get tracks from specified playlist
*/
function getTracks(playlist) {
  $.ajax({
    url: 'https://api.spotify.com/v1/playlists/'+playlist+'/tracks?limit=20',
    type: 'GET',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    success: function(data) {
      console.log(data);
      updateTracks(data);

      // hide loading
      $('#loading-container').fadeOut();

      // Bring track list into view
      window.scrollTo(0, 0);
      //$('html,body').animate({ scrollTop: 0 }, 'slow');
      $('#tracks-container').css('left', '100%');
      $('#tracks-container').animate(
        {
          left: 0
        }, 400,
        function() {
          $('#playlists-container').hide();
        }
      );

    }
  });
}

/** Generate formatted list of tracks
*/
function updateTracks(data) {
  tracks_data = data.items;

  for (let i = 0; i < tracks_data.length; i++) {

    // Check if track can be played (i.e. make sure it's available)
    /*
    if (tracks_data[i].track.available_markets.length == 0) {
      //continue;
    }
    */

    // load track metadata
    tracks_data[i].trivia_times = { start: 0, end: 0 }

    // see if start and end times are defined for this track
    if (typeof selected_playlist_data[i] !== 'undefined') {
      tracks_data[i].trivia_times.start = selected_playlist_data[i][0];
      tracks_data[i].trivia_times.end = selected_playlist_data[i][1];
    }

    // Set end time to track end if not yet specified
    if (tracks_data[i].trivia_times.end <= 0) {
      if (tracks_data[i].track.duration_ms < default_end_time) tracks_data[i].trivia_times.end = tracks_data[i].track.duration_ms;
      else tracks_data[i].trivia_times.end = default_end_time;
    }


    let artists = [];
    for (let j = 0; j < tracks_data[i].track.artists.length; j++) {
      artists.push(tracks_data[i].track.artists[j].name);
    }

    $("#tracks").append('\
      <div class="track-item" id="'+tracks_data[i].track.id+'">\
        <div class="track-item-heading">\
          <div class="track-image" style="background-image:url('+tracks_data[i].track.album.images[tracks_data[i].track.album.images.length-1].url+')">\
            <span id="play-button-'+i+'" class="button-play-pause material-symbols-rounded">play_arrow</span>\
          </div>\
          <div class="track-index">'+(i+1)+'</div>\
          <div class="track-text">\
            <div class="track-title">'+tracks_data[i].track.name+'</div>\
            <div class="track-artist">'+artists.join(", ")+'</div>\
            <div class="track-time-description"><span class="material-symbols-rounded">not_started</span><span class="time-desc-start"></span> <span class="material-symbols-rounded">timer</span><span class="time-desc-duration"></span>s</div>\
          </div>\
        </div>\
        <div class="track-item-controls">\
          <div class="track-item-container"></div>\
          <!--<input class="time-start" type="text" value="'+tracks_data[i].trivia_times.start+'" />\
          <input class="time-end" type="text" value="'+tracks_data[i].trivia_times.end+'" />-->\
          <input class="track-index" type="hidden" value="'+i+'" />\
          <div class="slider"></div>\
        </div>\
      </div>\
    ');


    // Update our text for start times
    updateTimeDescriptions(i, tracks_data[i].trivia_times.start, tracks_data[i].trivia_times.end);

    $( ".slider" ).last().slider({
      range: true,
      min: 0,
      max: tracks_data[i].track.duration_ms,
      values: [ tracks_data[i].trivia_times.start, tracks_data[i].trivia_times.end ],
      step: 100,
      slide: function( event, ui ) {
        if (ui.handleIndex == 0) {  // Keep interval the same when dragging left slider
          //$(this).siblings(".time-start").val(ui.values[0]);
          $(this).closest('.slider').slider('values',1,ui.values[0] + sliderDifference);
        }
        //$(this).siblings(".time-end").val(ui.values[1]);
        updateTimeDescriptions($(this).siblings('.track-index').val(), ui.values[0], ui.values[1]);
        updateProgressBar( $(this).siblings('.track-index').val() );
      },
      create: function( event, ui ) {
        $(this).append('<div class="play-progress-bar"></div>');
      },
      start: function( event, ui ) {
        sliderDifference = ui.values[1] - ui.values[0];
      },
      stop: function( event, ui ) {
        saveTimes();

        // Seek to new position and start playing - makes editing easier
        $(".button-play-pause").eq($(this).siblings('.track-index').val()).text('play_arrow').click();

      }
    });

  }


  /*
  $(".time-start").change(function() {
    $(this).siblings(".slider").slider( "values", 0, $(this).val() );
  });

  $(".time-end").change(function() {
    $(this).siblings(".slider").slider( "values", 1, $(this).val() );
  });
  */


  console.log(tracks_data);


  // Individual play button
  $(".button-play-pause").click(function(event) {

    //selected_track_id = event.target.id;
    //console.log(selected_track_id);
    //playTrack(selected_track_id);
    //console.log(event.target.id.replace("play-button-", ""));

    let index = parseInt(event.target.id.replace("play-button-", ""));
    let startTime = $(".slider").eq(index).slider( "values", 0 );
    let endTime = $(".slider").eq(index).slider( "values", 1 );

    console.log('media button clicked on index ' + index);
    console.log('existing status ' + $(this).text());
    if ($(this).text() == 'play_arrow') {
      playTrack(selected_playlist_id, index, startTime, endTime-startTime);
      $(this).text('stop');
    }
    else if ($(this).text() == 'stop') {
      clearTimeout(timerPause);
      clearTimeout(timerPlay);
      pauseTrack();
    }

  });

  // Reset the accordion
  /*
  $( "#tracks" ).accordion("refresh");
  $( "#tracks" ).accordion("option", "active", false);
  */
}

/** Update play time descriptions
*
*/
function updateTimeDescriptions(index, start, end) {

  let date = new Date(start);
  let timeString = date.toISOString().substring(11, 22).replace("00:", "");

  $('.time-desc-start').eq(index).text( timeString );
  $('.time-desc-duration').eq(index).text( (end-start)/1000 );
}

/** Play track from selectd playlist
*/
function playTrack(playlist_id, index, start_position = 0, duration = 0) {
  console.log('playing track ' + index + ' of playlist ' + playlist_id + ' starting at ' + start_position + ' for ' + duration + ' duration');

  // Reset all buttons back to play
  $(".button-play-pause").text('play_arrow');

  // Clear any existing pause timer
  clearTimeout(timerPause);

  let data = '{ "context_uri": "spotify:playlist:'+playlist_id+'", \
                "offset": { "position": '+index+' }, \
                "position_ms": '+start_position+' \
              }';
  //console.log(data);

  // Send API request to start playing
  $.ajax({
    url: 'https://api.spotify.com/v1/me/player/play',
    type: 'PUT',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    data: data,
    failure: function (data) {

    },
    success: function(data) {
      console.log("Playback started. Index " + index);

      // Save the time track started playing
      playStartTime = Date.now();

      // Change style of played tracks so it's easier to keep track
      $('.track-item').eq(index).addClass('played');

      // Start a timer to pause it after the defined duration
      if (duration > 0) timerPause = setTimeout(function() {
        pauseTrack();

        // Queue the next track if autopilot is on
        if (index + 1 < $(".button-play-pause").length) {
          console.log('total tracks: ' + $(".button-play-pause").length);

          clearTimeout(timerPlay);
          timerPlay = setTimeout(function() {
            if ($("#autopilot").is(':checked')) {
              $(".button-play-pause").eq(index+1).click();

              $([document.documentElement, document.body]).animate({
                scrollTop: $(".track-item").eq(index+1).offset().top - 40
              }, 800);
            }
          }, 1000 * $("input:radio[name='pause-interval']:checked").val() )
        }

      }, duration);

      // Start an interval to move progress bar
      clearInterval(intervalProgress);
      intervalProgress = setInterval(function() {
        updateProgressBar(index);
      }, 100);

      /*
      // Queue the next track if autopilot is on
      if (index + 1 < $(".button-play-pause").length) {
        console.log('total tracks: ' + $(".button-play-pause").length);

        clearTimeout(timerPlay);
        timerPlay = setTimeout(function() {
          if ($("#autopilot").is(':checked')) {
            $(".button-play-pause").eq(index+1).click();

            $([document.documentElement, document.body]).animate({
              scrollTop: $(".track-item").eq(index+1).offset().top-20
            }, 800);
          }
        }, duration + 1000 * $("input:radio[name='pause-interval']:checked").val() )
      }
      */



    }
  });
}

function updateProgressBar(index) {
  let pixelsPerTime = $(".slider").eq(index).width() / $(".slider").eq(index).slider( "option", "max" );
  $(".play-progress-bar").eq(index).width( pixelsPerTime * (Date.now() - playStartTime ) );
  $(".play-progress-bar").eq(index).css("left", pixelsPerTime * $(".slider").eq(index).slider( "values", 0 ) );
}

function pauseTrack() {
  clearTimeout(timerPause);
  clearInterval(intervalProgress);
  console.log('clearing play timer and intervals');

  $.ajax({
    url: 'https://api.spotify.com/v1/me/player/pause',
    type: 'PUT',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    data: data,
    success: function(data) {
      console.log("Playback paused");

      // Reset all buttons back to play
      $(".button-play-pause").text('play_arrow');
    }
  });

  //playerPause();
  //$("#togglePlay").click();
}

/** Save string to playlist's description
*/
function saveDescription(reset=false) {
  clearTimeout(timerSave); // clear any existing timer for this function

  // Do nothing if autosave is not checked
  if (!$("#autosave").is(':checked') || $('#autosave').prop('disabled')) {
    return;
  }


  let content_values = [];

  if (!reset) {
    $( ".slider" ).each(function() {
      content_values.push( $(this).slider( "values", 0 ) + ',' + $(this).slider( "values", 1 ) );
    });
  }
  let data = '{ "description": "'+content_values.join(";")+'" }';
  console.log(data);

  $.ajax({
    url: 'https://api.spotify.com/v1/playlists/'+selected_playlist_id,
    type: 'PUT',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    data: data,
    success: function(data) {
      console.log('Saved times');
      getPlaylists(true);
    }
  });

}

function userProfileTemplate(data) {
  $('#profile-picture').css('background-image', 'url("' + data.images[0]?.url + '")');
  $('#display-name').html(data.display_name);

  return `<h1>Logged in as ${data.display_name}</h1>
    <table>
        <tr><td>Display name</td><td>${data.display_name}</td></tr>
        <tr><td>Id</td><td>${data.id}</td></tr>
        <tr><td>Email</td><td>${data.email}</td></tr>
        <tr><td>Spotify URI</td><td><a href="${data.external_urls.spotify}">${data.external_urls.spotify}</a></td></tr>
        <tr><td>Link</td><td><a href="{{href}">${data.href}</a></td></tr>
        <tr><td>Profile Image</td><td><a href="${data.images[0]?.url}">${data.images[0]?.url}</a></td></tr>
        <tr><td>Country</td><td>${data.country}</td></tr>
    </table>`;
}

function oAuthTemplate(data) {
  return `<h2>oAuth info</h2>
    <table>
      <tr>
          <td>Access token</td>
          <td>${data.access_token}</td>
      </tr>
      <tr>
          <td>Refresh token</td>
          <td>${data.refresh_token}</td>
      </tr>
      <tr>
          <td>Expires at</td>
          <td>${new Date(parseInt(data.expires_at, 10)).toLocaleString()}</td>
      </tr>
    </table>`;
}

function errorTemplate(data) {
  return `<h2>Error info</h2>
    <table>
      <tr>
          <td>Status</td>
          <td>${data.status}</td>
      </tr>
      <tr>
          <td>Message</td>
          <td>${data.message}</td>
      </tr>
    </table>`;
}
