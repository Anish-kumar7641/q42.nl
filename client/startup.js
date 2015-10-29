Meteor.startup( () => {
  $.ajaxSetup({cache: true});

  // see 6_animation.styl#4
  const isFirefox = /Firefox/.test(navigator.userAgent);
  const isIE11 = !window.ActiveXObject && "ActiveXObject" in window;
  if (!isFirefox && !isIE11){
    $("head").append( $("<style/>").text(".container > * { opacity: 0 }") );
  }
});
