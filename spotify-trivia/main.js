(function () {
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
    mainPlaceholder.innerHTML = errorTemplate({
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

    oauthPlaceholder.innerHTML = oAuthTemplate({
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
        user_id = data.id;
        playlistData = [];
        getPlaylists(true);

        //console.log(data);
        document.getElementById('login').style.display = 'none';
        document.getElementById('loggedin').style.display = 'unset';
        mainPlaceholder.innerHTML = userProfileTemplate(data);
      })
      .catch((error) => {
        console.error(error);
        mainPlaceholder.innerHTML = errorTemplate(error.error);
      });


  }


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
        else {

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

    for (let i = 0; i < playlistData.length; i++) {
      $("#playlists").append('<div class="playlist-item-container" id="'+playlistData[i].id+'">'+playlistData[i].name+'</div>');
    }

    // open tracks upon clicking
    $(".playlist-item-container").click(function(event) {
      $("#tracks").html(""); // reset currently selected playlist

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
      selected_playlist_id = event.target.id;
      console.log(selected_playlist_id);
      getTracks(selected_playlist_id);
    });
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
      }
    });
  }

  /** Generate formatted list of tracks
  */
  function updateTracks(data) {
    tracks_data = data.items;

    for (let i = 0; i < tracks_data.length; i++) {

      // load track metadata
      tracks_data[i].trivia_times = { start: 0, end: 0 }

      // see if start and end times are defined for this track
      if (typeof selected_playlist_data[i] !== 'undefined') {
        tracks_data[i].trivia_times.start = selected_playlist_data[i][0];
        tracks_data[i].trivia_times.end = selected_playlist_data[i][1];
      }

      // Set end time to track end if not yet specified
      if (tracks_data[i].trivia_times.end <= 0) {
        tracks_data[i].trivia_times.end = tracks_data[i].track.duration_ms;
      }

      $("#tracks").append('\
        <div class="track-item" id="'+tracks_data[i].track.id+'">\
          <div class="track-item-container">' + (i+1) + '. ' + tracks_data[i].track.name+'</div>\
          <input class="time-start" type="text" value="'+tracks_data[i].trivia_times.start+'" />\
          <input class="time-end" type="text" value="'+tracks_data[i].trivia_times.end+'" />\
          <div class="slider"></div>\
        </div>\
      ');

      $( ".slider" ).last().slider({
        range: true,
        min: 0,
        max: tracks_data[i].track.duration_ms,
        values: [ tracks_data[i].trivia_times.start, tracks_data[i].trivia_times.end ],
        slide: function( event, ui ) {
          clearTimeout(timerSave);
          $(this).siblings(".time-start").val(ui.values[0]);
          $(this).siblings(".time-end").val(ui.values[1]);
          timerSave = setTimeout(saveDescription, 2000);
        }
      });
    }

    // also save if user types into textbox
    $("input").change(function() {
      clearTimeout(timerSave);
      timerSave = setTimeout(saveDescription, 2000);
    });

    $(".time-start").change(function() {
      $(this).siblings(".slider").slider( "values", 0, $(this).val() );
    });

    $(".time-end").change(function() {
      $(this).siblings(".slider").slider( "values", 1, $(this).val() );
    });


    console.log(tracks_data);


    // TEST play track on click
    $(".track-item-container").click(function(event) {

      //selected_track_id = event.target.id;
      //console.log(selected_track_id);
      //playTrack(selected_track_id);
      playTrack(selected_playlist_id, $(this).parent().index(), $(this).siblings(".time-start").val());
    });
  }

  /** Play track from selectd playlist
  */
  function playTrack(playlist_id, index, start_position = 0, duration = 0) {
    console.log(playlist_id + " " + index);

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
      success: function(data) {
        console.log(data);

        // Start a timer to pause it after the defined duration
        timerPause = setTimeout(pauseTrack, $(".time-end").eq(index).val() - $(".time-start").eq(index).val() );

        // Queue the next track if autopilot is on
        if ($("#autopilot").is(':checked') && index + 1 < $(".track-item-container").length) {
          console.log("SHOULD AUTOPLAY");
          console.log($(".track-item-container").length);

          clearTimeout(timerPlay);
          timerPlay = setTimeout(function() {
            if ($("#autopilot").is(':checked')) $(".track-item-container").eq(index+1).click();
          }, $(".time-end").eq(index).val() - $(".time-start").eq(index).val() + 4000)

        }

      }
    });
  }

  function pauseTrack() {
    $.ajax({
      url: 'https://api.spotify.com/v1/me/player/pause',
      type: 'PUT',
      headers: {
        'Authorization' : 'Bearer ' + access_token
      },
      data: data,
      success: function(data) {
        console.log(data);
      }
    });

    //playerPause();
    //$("#togglePlay").click();
  }

  /** Save string to playlist's description
  */
  function saveDescription() {
    clearTimeout(timerSave); // clear any existing timer for this function

    let content_values = [];

    $( ".track-item" ).each(function() {
      content_values.push( $(this).children(".time-start").val() + ',' + $(this).children(".time-end").val() )
    });

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
        console.log(data);
        console.log('saved');
        getPlaylists(true);
      }
    });

  }

  function userProfileTemplate(data) {
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

  // Your client id from your app in the spotify dashboard:
  // https://developer.spotify.com/dashboard/applications
  const client_id = '43a22aa24295448faec97a2636493a7d';
  const redirect_uri = 'http://127.0.0.1/spotify-trivia/'; // Your redirect uri

  // Restore tokens from localStorage
  let access_token = localStorage.getItem('access_token') || null;
  let refresh_token = localStorage.getItem('refresh_token') || null;
  let expires_at = localStorage.getItem('expires_at') || null;

  // References for HTML rendering
  const mainPlaceholder = document.getElementById('main');
  const oauthPlaceholder = document.getElementById('oauth');

  // If the user has accepted the authorize request spotify will come back to your application with the code in the response query string
  // Example: http://127.0.0.1:8080/?code=NApCCg..BkWtQ&state=profile%2Factivity
  const args = new URLSearchParams(window.location.search);
  const code = args.get('code');

  var playlistData = [];
  var user_id = "";
  var selected_playlist_id = "";
  var selected_playlist_data = [];
  var tracks_data = [];
  var timerSave;
  var timerPause;
  var timerPlay;

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
  setInterval(refreshToken, 1000*60*10);

  document
    .getElementById('logout-button')
    .addEventListener('click', logout, false);
})();
