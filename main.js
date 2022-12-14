let default_end_time = 30*1000;
let track_limit = 35;
let playbackTimeFromEnd = 5000; // when moving the right slider, go back this far and play

var appTitle = 'Snipify';

var playlistData = [];
var user_id = "";
var selected_playlist_id = "";
var selected_playlist_index = -1;
var selected_playlist_data = [];
var tracks_data = [];

// timers and intervals
var timerSave;  // wait before saving description
var timerPause;
var timerPlay;
var intervalProgressNeedle; // interval to move the progress needle

// Keep track for progress bar
var currentPlayingTrackIndex = -1;
var previousPlayerPauseState = true;  // Save previous player state - for checking if player state has changed since last check
let sliderDifference = 0; // Save difference between start and end times for adjusting start position but maintain same duration
let overrideStartPosition = -1; // Override selected start position - for playing x seconds from end of selection

// flags
let has_opened_playlist = false;  // Has the user opened a playlist since loading the page? for opening hashed playlist in URL
var playbackTransferred = false;  // Has spotify web player transferred playback over?
let isMovingSlider = false; // Keep track of whether the user is currently moving the slider or not

$( document ).ready(function() {

  // Save control settings to localdata
  if (localStorage.getItem('autoplay_mode') == 1) $('#autopilot').prop('checked', true);
  $("#autopilot").click(function(){
    if ($("#autopilot").is(':checked')) localStorage.setItem('autoplay_mode', 1);
    else localStorage.setItem('autoplay_mode', 0);
  });

  if (localStorage.getItem('autosave_mode') == 1 ||
      localStorage.getItem('autosave_mode') === null) $('#autosave').prop('checked', true);
  $("#autosave").click(function(){
    if ($("#autosave").is(':checked')) localStorage.setItem('autosave_mode', 1);
    else localStorage.setItem('autosave_mode', 0);
  });

  if (localStorage.getItem('autoplay_interval') > 0) $("input[name=pause-interval][value=" + localStorage.getItem('autoplay_interval') + "]").prop('checked', true);
  $(".pause-interval-radio").click(function(){
    localStorage.setItem('autoplay_interval', $(this).val());
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

    if (selected_playlist_index < 0) return; // do nothing if no playlist currently selected

    console.log('local: close playlist button clicked');

    document.title = appTitle;

    selected_playlist_id = "";
    selected_playlist_index = -1;
    selected_playlist_data = [];

    parent.location.hash = '';
    getPlaylists(true);

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

  $('#button-copy').click(function() {
    navigator.clipboard.writeText(window.location.href);
    $(this).text('assignment_turned_in');
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

});

/**
* Save the playlist's start and end times after a specified interval
*/
function saveTimes(delay=2000) {
  $('label[for=autosave] > span').html('save_as');
  clearTimeout(timerSave);
  timerSave = setTimeout(saveDescription, delay);
}

/**
* Gets run when js file from Spotify is loaded?
*/
function onSpotifyWebPlaybackSDKReady() {

  // Check if valid access token available. If not, wait until one is obtained.
  if (access_token == null || expires_at < Date.now()) {
    // No access token yet, retry
    console.log('sdk: waiting for access token...');
    setTimeout(onSpotifyWebPlaybackSDKReady, 1000);
    return;
  }
  else {
    console.log('sdk: access token found');
  }

  const player = new Spotify.Player({
      name: appTitle,
      getOAuthToken: cb => { cb(access_token); },
      volume: 0.5
  });

  // Ready
  player.addListener('ready', ({ device_id }) => {
    console.log('sdk: Ready with Device ID', device_id);

    // Try to tranfer playback to this page
    $.ajax({
      url: 'https://api.spotify.com/v1/me/player',
      type: 'PUT',
      headers: {
        'Authorization' : 'Bearer ' + access_token
      },
      data: '{"device_ids": ["'+device_id+'"]}',
      success: function(data) {
        console.log("api: Successfully transferred playback to web player");
        playbackTransferred = true;
        $('.button-play-pause').text('play_arrow');  // enable all the play buttons currently existing
        $('.track-loader').hide();
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



  // Monitor player state so we can get exact start and stop times
  player.addListener('player_state_changed', ( state => {

    if (state == null || state.loading) return;  // Do not start progress bar if loading

    // Do not check if current playing track is out of sync - prevents track being stopped before it can start
    if (state.track_window.current_track.id != $('.track-item').eq(currentPlayingTrackIndex).attr('id')) return;

    // Save the pause state and do nothing if it has not changed
    // This is because this will trigger multiple times and reset the progress bar
    if (state.paused == previousPlayerPauseState) return;
    else if (state.paused && currentPlayingTrackIndex >= 0) pauseTrack();  // Pause the track if it's been paused in another player
    previousPlayerPauseState = state.paused;  // Update local state

    // Start moving the progress bar etc when the track actually starts to play
    if (!state.paused && currentPlayingTrackIndex >= 0) {  // Track has started playing

      $('.track-loader').hide(); // hide all loading spinners

      // Start an interval to keep track of player's position
      clearInterval(intervalProgressNeedle);
      intervalProgressNeedle = setInterval(function() {
        player.getCurrentState().then(state => {

          // Remove the interval if not in a valid playing state
          if (!state || currentPlayingTrackIndex < 0 || state.paused) {
            clearInterval(intervalProgressNeedle);
            return;
          }

          // Move the needle element
          $('.play-needle-container').eq(currentPlayingTrackIndex).css('left', (state.position/state.duration*100)+'%');

          // Check if playback is past the defined limit
          // only do so if the user is not currently moving the slider
          if ( !isMovingSlider && state.position >= $(".slider").eq(currentPlayingTrackIndex).slider( "values", 1 ) ) {
            // Queue the next track
            if ($("#autopilot").is(':checked')) queueTrack(currentPlayingTrackIndex+1);
            pauseTrack();
          }

        });
      }, 50);

      // Change style of played tracks so it's easier to keep track
      $('.track-item').eq(currentPlayingTrackIndex).addClass('played');

    }
    else currentPlayingTrackIndex = -1; // If paused, unset the currently playing track

  }));



  document.getElementById('playerTogglePlay').onclick = function() {
    player.playerTogglePlay();
  };

  $('#playerPause').click(function() {
    player.pause().then(console.log('sdk: paused playback'));
  });

  $('#playerPlay').click(function() {
    player.resume().then(console.log('sdk: resumed playback'));
  });

  player.connect();
}

/**
* queue the track at provided index after waiting time the user has selected
*/
function queueTrack(index) {
  if (index >= $(".button-play-pause").length) return false; // Check if the provided index is within number of tracks

  clearTimeout(timerPlay);
  timerPlay = setTimeout(function() {
    if ($("#autopilot").is(':checked')) { // only play if autoplay is still selected
      $(".button-play-pause").eq(index).click();

      // Scroll to the item
      //if (!$(".track-item").eq(autoPlayNextIndex).isInViewport()) { // but only if not in current viewport
        $([document.documentElement, document.body]).animate({
          scrollTop: $(".track-item").eq(index).offset().top - 40
        }, 800);
      //}
    }
  }, 1000 * $("input:radio[name='pause-interval']:checked").val() ) // How long to pause between tracks
}

/** Recursive function to get all the user's playlists and filter for owned ones only
*/
function getPlaylists(update = false, offset = 0, limit = 50) {
  uptakeTokenIfExpired();

  $('#loading-container').fadeIn();

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
    //console.log(data);

    if (offset == 0) playlistData = []; // Reset the array if starting from 0
    playlistData = playlistData.concat(data.items);

    // resursive function to ensure all playlists are grabbed
    if (playlistData.length < data.total) getPlaylists(update, data.offset + data.limit, data.limit);
    else { // OK we got all the user's playlists
      $('#loading-container').fadeOut();
      console.log('api: got user playlists');
      console.log(playlistData);
      if (update) updatePlaylists();
    }

  })
  .catch((error) => {
    console.error(error);
    window.location(redirect_uri); // refresh the page if we get async error
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

    let attributes_string = "";
    for (let j = 0; j < attributes.length; j++) {
      attributes_string += attributes[j];
    }

    // Get total playtime for playlist
    let descData = parseDesc(playlistData[i].description);
    let durationString = "";

    if (descData) {
      durationString += '<span class="material-symbols-rounded">queue_music</span>'+descData.length+' ';
      durationString += '<span class="material-symbols-rounded">timer</span>'+msToTimestamp(totalPlayTimeFromDesc(descData));
    }
    else {
      durationString += '<span class="material-symbols-rounded">queue_music</span>'+playlistData[i].tracks.total;
    }

    $("#playlists").append(
      '<div class="playlist-item-container" id="playlist-'+playlistData[i].id+'">\
        <input type="hidden" class="playlist-index" value="'+i+'" />\
        <div class="playlist-image"><div class="playlist-details">'+attributes_string+'</div></div>\
        <div class="playlist-text">\
          <div class="playlist-title"><span>'+playlistData[i].name+'</span></div>\
          <div class="playlist-byline"><span>by '+playlistData[i].owner.display_name+'</span></div>\
          <div class="playlist-duration">'+durationString+'</div>\
        </div>\
      </div>'
    );

    // Replace generic image if cover art exists
    if (playlistData[i].images.length > 0) {
      $('#playlist-' + playlistData[i].id + ' > .playlist-image').css('background-image', 'url('+playlistData[i].images[playlistData[i].images.length-1].url+')');
    }

  }

  // open tracks upon clicking
  // user opened a playlist
  $(".playlist-item-container").click(function(event) {

    selected_playlist_id = event.target.id.replace("playlist-", "").replace("discover-");
    selected_playlist_index = $(this).children('.playlist-index').val();
    console.log('local: attempting to get playlist with index ' + selected_playlist_index + ' - id: ' + selected_playlist_id);

    // Update page title
    document.title = appTitle + ' - ' + playlistData[selected_playlist_index].name;

    // Check to make sure a playlist wasn't loaded on refresh
    if (has_opened_playlist) $("#tracks").html("");
    else has_opened_playlist = true;

    // Show loading spinner
    $('#loading-container').fadeIn();

    // Set the image to this playlist's art
    $('#playlist-image').css('background-image',
      $('#' + event.target.id + ' > .playlist-image').css('background-image')
    );

    // Set playlist name
    $('#tracks-playlist-title').text(
      //$('#' + event.target.id + ' .playlist-title span').text()
      playlistData[selected_playlist_index].name
    );
    $('#tracks-playlist-byline').html(
      //$('#' + event.target.id + ' .playlist-byline').text()
      'by <a href="'+playlistData[selected_playlist_index].owner.external_urls.spotify+'" target="_blank">' + playlistData[selected_playlist_index].owner.display_name + '</a>'
    );
    $('#tracks-playlist-details > div').html(
      $('#' + event.target.id + ' .playlist-details').html()
    );

    // Enable or disable autosave depending on if the user can write to the playlist
    if (playlistData[selected_playlist_index].collaborative ||
        playlistData[selected_playlist_index].owner.id == user_id
    ) {
      $("#autosave").prop('disabled', false);
    }
    else $("#autosave").prop('disabled', true);

    // Load data from description
    selected_playlist_data = parseDesc( playlistData[$(this).index()].description );
    getTracks(selected_playlist_id);

    // Reset save icon
    $('label[for=autosave] > span').html('save');

    // Reset 'share' icon
    $('#button-copy').text('share');

    // Set the location hash to this id
    $(location).attr('hash', event.target.id.replace("playlist-", ""));
  });

  // If hash attribute already exists in URL, open up that playlist
  if ($(location).attr('hash')) {
    console.log('local: got playlist from hash ' + $(location).attr('hash'));
    let targetPlaylist = $( $(location).attr('hash').replace("#", "#playlist-") );
    if (targetPlaylist.length > 0) targetPlaylist.click();
    else addPlaylistToLibrary($(location).attr('hash').replace("#", "")); // if this playlist is not in user's library, add it
  }

  // Reapply filter
  $('#filter').trigger('keyup');
}

/**
* Parse data obtained from playlist description
*   returns false on invalid format
*   returns a two-dimensional array of timestamps
*/
function parseDesc(input) {
  let descData = [];
  let data = input.split(";");;
  for (let i = 0; i < data.length; i++) {
    let times = data[i].split(",");
    if (times.length < 2) return false; // probably invalid data - leave data blank
    if (isNaN(parseInt(times[0])) || isNaN(parseInt(times[1]))) return false; // comma exists but not int values
    descData[i] = [ parseFloat(times[0])*100, parseFloat(times[1])*100 ];
  }
  return descData;
}

/**
* Returns total play time from playlist description data
*/
function totalPlayTimeFromDesc(descData) {
  let total = 0;
  for (let i = 0; i < descData.length; i++) {
    total += descData[i][1] - descData[i][0];
  }
  return total;
}

/**
* Formats ms to readable string
*/
function msToTimestamp(ms) {
  let date = new Date(ms);
  return date.toISOString().substring(11, 19).replace("00:", "");
}


/** Get tracks from specified playlist
*/
function getTracks(playlist) {
  uptakeTokenIfExpired();

  $.ajax({
    url: 'https://api.spotify.com/v1/playlists/'+playlist+'/tracks?limit=' + track_limit,
    type: 'GET',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    success: function(data) {
      console.log('api: selected playlist loaded');
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
    // TODO - currently crashes on unavailable tracks
    /*
    if (tracks_data[i].track.available_markets.length == 0) {
      //continue;
    }
    */

    // load track metadata
    tracks_data[i].snip_times = { start: 0, end: 0 }

    // see if start and end times are defined for this track
    if (typeof selected_playlist_data[i] !== 'undefined') {
      tracks_data[i].snip_times.start = selected_playlist_data[i][0];
      tracks_data[i].snip_times.end = selected_playlist_data[i][1];
    }

    // Set end time to track end if not yet specified
    if (tracks_data[i].snip_times.end <= 0) {
      if (tracks_data[i].track.duration_ms < default_end_time) tracks_data[i].snip_times.end = tracks_data[i].track.duration_ms;
      else tracks_data[i].snip_times.end = default_end_time;
    }


    let artists = [];
    for (let j = 0; j < tracks_data[i].track.artists.length; j++) {
      artists.push(tracks_data[i].track.artists[j].name);
    }

    // Track item template
    $("#tracks").append('\
      <div class="track-item" id="'+tracks_data[i].track.id+'" tabindex="'+i+'">\
        <div class="track-item-heading">\
          <div class="track-image" style="background-image:url('+tracks_data[i].track.album.images[tracks_data[i].track.album.images.length-1].url+')">\
            <div class="track-loader"><span class="loader"></span></div>\
            <span id="play-button-'+i+'" class="button-play-pause material-symbols-rounded"></span>\
          </div>\
          <div class="track-index">'+(i+1)+'</div>\
          <div class="track-text">\
            <div class="track-title">'+tracks_data[i].track.name+'</div>\
            <div class="track-artist">'+artists.join(", ")+'</div>\
            <div class="track-time-description">\
              <span class="material-symbols-rounded">not_started</span><span class="time-desc-start"></span>\
              <span class="time-desc-duration-container"><span class="material-symbols-rounded">timer</span><span class="time-desc-duration"></span>s</span>\
              <span class="time-desc-end-container"><span class="material-symbols-rounded">stop_circle</span><span class="time-desc-end"></span>\
            </div>\
          </div>\
        </div>\
        <div class="track-item-controls">\
          <div class="track-item-container"></div>\
          <!--<input class="time-start" type="text" value="'+tracks_data[i].snip_times.start+'" />\
          <input class="time-end" type="text" value="'+tracks_data[i].snip_times.end+'" />-->\
          <input class="track-index" type="hidden" value="'+i+'" />\
          <div class="slider"></div>\
        </div>\
      </div>\
    ');


    // Update our text for start times
    updateTimeDescriptions(i, tracks_data[i].snip_times.start, tracks_data[i].snip_times.end);

    // Add slider
    $( ".slider" ).last().slider({
      range: true,
      min: 0,
      max: tracks_data[i].track.duration_ms,
      values: [ tracks_data[i].snip_times.start, tracks_data[i].snip_times.end ],
      step: 100,
      disabled: true,
      create: function( event, ui ) {
        $(this).append('<div class="play-needle-container"><div class="play-needle"></div></div>');
      },
      slide: function( event, ui ) {
        if (ui.handleIndex == 0 && $('.time-desc-duration-container').eq(i).is(":visible") ) {  // Keep interval the same when dragging left slider
          $(this).closest('.slider').slider('values',1,ui.values[0] + sliderDifference);
          updateTimeDescriptions(i, ui.values[0], ui.values[0] + sliderDifference);
        }
        else updateTimeDescriptions(i, ui.values[0], ui.values[1]);
      },
      start: function( event, ui ) {
        // disable scrolling
        $('html, body').css({
          overflow: 'hidden',
          height: '100%'
        });

        isMovingSlider = true;

        // Get difference in sliders so difference can be preserved when moving left handle only
        sliderDifference = ui.values[1] - ui.values[0];
      },
      stop: function( event, ui ) {
        // re-enable scrolling
        $('html, body').css({
          overflow: 'auto',
          height: 'auto'
        });

        // manually set the difference again so we don't get any small discrepancies
        if (ui.handleIndex == 0 && $('.time-desc-duration-container').eq(i).is(":visible") ) {  // Keep interval the same when dragging left slider
          $(this).closest('.slider').slider('values',1,ui.values[0] + sliderDifference);
        }
        updateTimeDescriptions(i, ui.values[0], ui.values[1]);

        isMovingSlider = false;

        saveTimes();

        // Seek to new position and start playing - makes editing easier
        // Only play from new point if user is already playing
        if (ui.handleIndex == 0 && $(".button-play-pause").eq($(this).siblings('.track-index').val()).text() == "stop") {
        }
        else if (ui.handleIndex == 1) { // always play if the user moved the right handle
          overrideStartPosition = ui.value - playbackTimeFromEnd;
          if (overrideStartPosition < ui.values[0]) overrideStartPosition = ui.values[0];
        }
        else return;
        $(".button-play-pause").eq($(this).siblings('.track-index').val()).text('play_arrow').click();

      }
    });




    $('.track-item').last().focus(function(event) {
      $('.slider').slider("disable") // disable every other slider first
      $(this).find('.slider').slider("enable");
    });
  } // end for loop

  // If playback has already been transferred, remove the disabled class
  if (playbackTransferred) $('.button-play-pause').text('play_arrow');
  if (playbackTransferred) $('.track-loader').hide();

  // Toggle slider interact by duration or by end time
  $('.time-desc-end-container').click(function() {
    $('.time-desc-end-container').hide();
    $('.time-desc-duration-container').show();
  }).hide(); // this is hidden by default

  $('.time-desc-duration-container').click(function() {
    $('.time-desc-duration-container').hide();
    $('.time-desc-end-container').show();
  });


  // Individual play button
  $(".button-play-pause").click(function(event) {

    let index = parseInt(event.target.id.replace("play-button-", ""));
    let startTime = $(".slider").eq(index).slider( "values", 0 );
    let endTime = $(".slider").eq(index).slider( "values", 1 );

    console.log('local: media button clicked on index ' + index + ' - existing status ' + $(this).text());

    clearTimeout(timerPause);
    clearTimeout(timerPlay);
    clearInterval(intervalProgressNeedle);

    previousPlayerPauseState = true; // Reset pause state for progress bar updates

    if ($(this).text() == 'play_arrow') { // play
      playTrack(selected_playlist_id, index, startTime, endTime-startTime);
      $(this).text('stop');
      $(this).siblings('.track-loader').show();
    }
    else if ($(this).text() == 'stop') { // pause
      pauseTrack();
    }

  });
}

/**
* Update play time descriptions
*/
function updateTimeDescriptions(index, start, end) {

  let date = new Date(start);
  $('.time-desc-start').eq(index).text( date.toISOString().substring(11, 22).replace("00:", "") );

  date.setTime(end);
  $('.time-desc-end').eq(index).text( date.toISOString().substring(11, 22).replace("00:", "") );

  $('.time-desc-duration').eq(index).text( (end-start)/1000 );
}

/** Play track from selectd playlist
*/
function playTrack(playlist_id, index, start_position = 0, duration = 0) {
  // Check if we need to override start position
  if (overrideStartPosition >= 0) {
    console.log('local: overriding start position to ' + overrideStartPosition);
    start_position = overrideStartPosition;
    overrideStartPosition = -1;
  }

  console.log('local: playing track ' + index + ' of playlist ' + playlist_id + ' starting at ' + start_position + ' for ' + duration + ' duration');

  // Reset all buttons back to play
  $(".button-play-pause").text('play_arrow');

  // Clear any existing pause timer
  clearTimeout(timerPause);

  // Save which index was clicked and the intended duration
  currentPlayingTrackIndex = index;
  //currentPlayingTrackDuration = duration;

  let data = '{ "context_uri": "spotify:playlist:'+playlist_id+'", \
                "offset": { "position": '+index+' }, \
                "position_ms": '+start_position+' \
              }';
  // Send API request to start playing
  $.ajax({
    url: 'https://api.spotify.com/v1/me/player/play',
    type: 'PUT',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    data: data,
    success: function() {
      console.log("api: successful request for playback");
      $('#playerPlay').click(); // on iOS browsers, users must click button?
    }
  });
}


/*
function pauseAfterDuration(duration, autoPlayNextIndex = -1) {
  if (duration <= 0) return false;

  clearTimeout(timerPause);
  timerPause = setTimeout(function() {
    pauseTrack();

    // Queue the next track if autopilot is on
    if (autoPlayNextIndex >= 0 && autoPlayNextIndex < $(".button-play-pause").length) { // Check if the provided index is within number of tracks
      console.log('total tracks: ' + $(".button-play-pause").length);

      clearTimeout(timerPlay);
      timerPlay = setTimeout(function() {
        if ($("#autopilot").is(':checked')) {
          $(".button-play-pause").eq(autoPlayNextIndex).click();

          // Scroll to the item
          //if (!$(".track-item").eq(autoPlayNextIndex).isInViewport()) { // but only if not in current viewport
            $([document.documentElement, document.body]).animate({
              scrollTop: $(".track-item").eq(autoPlayNextIndex).offset().top - 40
            }, 800);
          //}

        }
      }, 1000 * $("input:radio[name='pause-interval']:checked").val() ) // How long to pause between tracks
    }

  }, duration);
}
*/

/*
// Start moving progress bar along its track
function startProgressBar(index) {
  clearInterval(intervalProgress);
  intervalProgress = setInterval(function() {
    updateProgressBar(index);
  }, 100);
}
*/

/*
function updateProgressBar(index) {
  let pixelsPerTime = $(".slider").eq(index).width() / $(".slider").eq(index).slider( "option", "max" );
  $(".play-progress-bar").eq(index).width( pixelsPerTime * (Date.now() - playStartTime ) );
  $(".play-progress-bar").eq(index).css("left", pixelsPerTime * $(".slider").eq(index).slider( "values", 0 ) );
}
*/

function pauseTrack() {
  console.log('local: Pausing web player');

  currentPlayingTrackIndex = -1; // Reset current track
  //currentPlayingTrackDuration = -1;

  clearTimeout(timerPause);
  clearInterval(intervalProgressNeedle);  // Stop the progress bar


  // Reset all buttons back to play
  $(".button-play-pause").text('play_arrow');

  $('#playerPause').click();
  return;

  /*
  $.ajax({
    url: 'https://api.spotify.com/v1/me/player/pause',
    type: 'PUT',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    success: function(data) {
      console.log("Playback paused");

      // Reset all buttons back to play
      $(".button-play-pause").text('play_arrow');
    }
  });
  */

  //playerPause();
  //$("#playerTogglePlay").click();
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
      content_values.push( $(this).slider( "values", 0 )/100 + ',' + $(this).slider( "values", 1 )/100 );
    });
  }
  let data = '{ "description": "'+content_values.join(";")+'" }';

  console.log('local: prepared data to save to playlist description');
  console.log(data);

  $('label[for=autosave] > span').html('save_as'); // change the icon whilst save in progress

  $.ajax({
    url: 'https://api.spotify.com/v1/playlists/'+selected_playlist_id,
    type: 'PUT',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    data: data,
    success: function(data) {
      console.log('api: saved times to playlist '+selected_playlist_id+' description');
      $('label[for=autosave] > span').text('save'); // reset icon to original
      //getPlaylists(true);
    }
  });

}
