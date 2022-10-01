
// Your client id from your app in the spotify dashboard:
// https://developer.spotify.com/dashboard/applications
const client_id = '43a22aa24295448faec97a2636493a7d';
//const redirect_uri = 'http://127.0.0.1/spotify-trivia/'; // Your redirect uri
//const redirect_uri = 'http://127.0.0.1/'; // Your redirect uri
//const redirect_uri = 'https://xia0.github.io/'; // Your redirect uri
const redirect_uri = window.location.href.split(/[?#]/)[0];
console.log('auth: redirect uri ' + redirect_uri);

// Restore tokens from localStorage
let access_token = localStorage.getItem('access_token') || null;
let refresh_token = localStorage.getItem('refresh_token') || null;
let expires_at = localStorage.getItem('expires_at') || null;

uptakeTokenIfExpired();


$( document ).ready(function() {
  console.log( "auth ready" );
  // References for HTML rendering
  const mainPlaceholder = $('#main');
  const oauthPlaceholder = $('#oauth');

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


});


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

function uptakeTokenIfExpired() {
  // Update token if current one is expired
  if (access_token != null) {

    let date = Date.now();
    if (expires_at < Date.now()) {
      console.log('local: access token expired. trying to refresh.');
      refreshToken();
      // block execution until token becomes valid
      //do {
        //
      //} while (expires_at < Date.now());
      console.log('local: got new access token');
    }
  }
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
  console.log('api: got token data');
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

    console.log('api: got user data');
    console.log(data);

    // Get user's playlist if once we confirm we are logged in
    user_id = data.id;
    playlistData = [];
    getPlaylists(true);

    // Display user details
    document.getElementById('login').style.display = 'none';
    document.getElementById('loggedin').style.display = 'unset';
    $("#main").innerHTML = userProfileTemplate(data);

    // Load the spotify player
    //console.log("sdk: attempting to load SDK player");
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
