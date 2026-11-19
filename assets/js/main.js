(function () {
  // Office clocks
  var clocks = document.querySelectorAll('[data-tz]');
  function tick() {
    clocks.forEach(function (el) {
      try {
        el.textContent = new Intl.DateTimeFormat('en-GB', {
          timeZone: el.getAttribute('data-tz'), hour: '2-digit', minute: '2-digit', hour12: false
        }).format(new Date()) + (el.classList.contains('tz') ? '' : ' local time');
      } catch (e) { el.textContent = ''; }
    });
  }
  if (clocks.length) { tick(); setInterval(tick, 30000); }

  // Contact form
  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = form.querySelector('.form-status');

  function say(msg, kind) {
    status.textContent = msg;
    status.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    form.classList.add('was-validated');
    if (!form.checkValidity()) {
      say('Please complete the highlighted fields.', 'err');
      var bad = form.querySelector(':invalid');
      if (bad) bad.focus();
      return;
    }
    // Placeholder: no backend yet. Swap this block for a fetch() to the
    // endpoint in /worker once it is deployed.
    say('Thank you. Our online form is not live yet — please check back soon.', 'ok');
  });
})();
