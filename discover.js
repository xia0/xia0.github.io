$( document ).ready(function() {
  console.log('tesst');

  $('#button-discover').click(function() {
    $('#loading-container').fadeIn();
    $('#discover-playlists').html("");
    getFeaturedPlaylists(featured_master_id);
  });


});

// This is the playlist whose description contains a comma separated list of featured playlist ids
var featured_master_id = '6muwPcTsMRX9aqgpRalpyT';

/**
* Returns an array of ids for discovery playlists
*/
function getFeaturedPlaylists(master_id) {
  $.ajax({
    url: 'https://api.spotify.com/v1/playlists/' + master_id,
    type: 'GET',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    success: function(data) {
      console.log('Got list of discovery playlists');
      $('#loading-container').fadeOut();
      let featured_playlist_ids = data.description.split(",");

      for (let i = 0; i < featured_playlist_ids.length; i++) {
        // First check if playlist already exists
        //if ( $('#playlist-'+featured_playlist_ids[i]).length == 0 )
          getFeaturedPlaylist(featured_playlist_ids[i]);
      }

    }
  });
}

/**
* Gets specific info about the featured playlist
*/
function getFeaturedPlaylist(playlist_id) {
  $.ajax({
    url: 'https://api.spotify.com/v1/playlists/'+playlist_id,
    type: 'GET',
    headers: {
      'Authorization' : 'Bearer ' + access_token
    },
    success: function(data) {
      console.log(data);

      // Add this playlist to the list on the front page


      // Get total playtime for playlist
      let descData = parseDesc(data.description);
      let durationString = "";

      if (descData) {
        if (descData.length > 0) durationString += '<span class="material-symbols-rounded">queue_music</span>'+descData.length+' ';
        durationString += '<span class="material-symbols-rounded">timer</span>'+msToTimestamp(totalPlayTimeFromDesc(descData));
      }

      // Append this item to playlists
      $("#discover-playlists").append(
        '<div style="display:none;" class="playlist-discover playlist-item-container" id="discover-playlist-'+data.id+'">\
          <div class="playlist-image"></div>\
          <div class="playlist-text">\
            <div class="playlist-title"><span>'+data.name+'</span></div>\
            <div class="playlist-byline"><span>by '+data.owner.display_name+'</span></div>\
            <div class="playlist-duration">'+durationString+'</div>\
          </div>\
        </div>'
      );
      // animate its appearance
      $('#discover-playlist-' + data.id).slideDown();

      // Replace generic image if cover art exists
      if (data.images.length > 0) {
        $('#discover-playlist-' + data.id + ' > .playlist-image').css('background-image', 'url('+data.images[data.images.length-1].url+')');
      }

      // Add functionality -- Add to user's library on click
      $('#discover-playlist-'+data.id).click(function() {
        // Show loading spinner
        $('#loading-container').fadeIn();

        addPlaylistToLibrary(data.id);
      });

    }
  });
}

/**
* Adds a playlist with provided id to user's library then opens it
*/
function addPlaylistToLibrary(playlist_id) {
  $.ajax({
    url: 'https://api.spotify.com/v1/playlists/' + playlist_id + '/followers',
    type: 'PUT',
    headers: { 'Authorization' : 'Bearer ' + access_token },
    success: function() {
      console.log('Added playlist ' + playlist_id + ' to user\'s library');

      $('#discover-playlist-'+playlist_id).remove();
      $(location).attr('hash', playlist_id); // Set the location hash to this id
      getPlaylists(true);
    }
  });
}
