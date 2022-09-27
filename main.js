let default_end_time = 25*1000;
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

$( document ).ready(function() {
  console.log( "ready!" );


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

});

/**
* Save the playlist's start and end times after a specified interval
*/
function saveTimes(delay=2000) {
  clearTimeout(timerSave);
  timerSave = setTimeout(saveDescription, delay);
}

/**
* Gets run when js file from Spotify is loaded?
*/
function onSpotifyWebPlaybackSDKReady() {

  if (access_token == null) return;

  const player = new Spotify.Player({
      name: 'Music Trivia Tool',
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

    // Get total playtime for playlist
    let descData = parseDesc(playlistData[i].description);
    let durationString = "";

    if (descData) {
      if (descData.length > 0) durationString += '<span class="material-symbols-rounded">queue_music</span>'+descData.length+' ';
      durationString += '<span class="material-symbols-rounded">timer</span>'+msToTimestamp(totalPlayTimeFromDesc(descData));
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
    selected_playlist_data = parseDesc( playlistData[$(this).index()].description );

    /*
    data = playlistData[$(this).index()].description.split(";");
    selected_playlist_data = [];
    for (let i = 0; i < data.length; i++) {
      let times = data[i].split(",");
      if (times.length < 2) break; // probably invalid data - leave data blank
      if (isNaN(parseInt(times[0])) || isNaN(parseInt(times[1]))) break; // comma exists but not int values
      selected_playlist_data[i] = [ parseInt(times[0]), parseInt(times[1]) ];
    }
    */
    //console.log(selected_playlist_data);

    // Load tracks from playlist

    getTracks(selected_playlist_id);


    $(location).attr('hash', event.target.id.replace("playlist-", "")); // Set the location hash to this id
  });

  // If hash attribute already exists in URL, open up that playlist
  if ($(location).attr('hash') && !has_opened_playlist) {
    $( $(location).attr('hash').replace("#", "#playlist-") ).click();
  }
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
    descData[i] = [ parseInt(times[0]), parseInt(times[1]) ];
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
      <div class="track-item" id="'+tracks_data[i].track.id+'" tabindex="'+i+'">\
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

    // Add slider
    $( ".slider" ).last().slider({
      range: true,
      min: 0,
      max: tracks_data[i].track.duration_ms,
      values: [ tracks_data[i].trivia_times.start, tracks_data[i].trivia_times.end ],
      step: 100,
      disabled: true,
      slide: function( event, ui ) {
        if (ui.handleIndex == 0) {  // Keep interval the same when dragging left slider
          //$(this).siblings(".time-start").val(ui.values[0]);
          $(this).closest('.slider').slider('values',1,ui.values[0] + sliderDifference);
        }
        //$(this).siblings(".time-end").val(ui.values[1]);
        updateTimeDescriptions($(this).siblings('.track-index').val(), ui.values[0], ui.values[1]);
        //updateProgressBar( $(this).siblings('.track-index').val() );
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
        // Only play from new point if user is already playing
        if ($(".button-play-pause").eq($(this).siblings('.track-index').val()).text() == "stop") {
          $(".button-play-pause").eq($(this).siblings('.track-index').val()).text('play_arrow').click();
        }

      }
    });


    $('.track-item').last().focus(function(event) {
      $('.slider').slider("disable") // disable every other slider first
      $(this).find('.slider').slider("enable");
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


}

/**
* Update play time descriptions
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
