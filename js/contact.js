/* Contact form -> Google Sheet (same endpoint as the original page) */
(() => {
  const form = document.forms['submit-to-google-sheet']; if (!form) return;
  const msg = document.getElementById('form-msg');
  const submit = form.querySelector('button[type="submit"]');
  const scriptURL = 'https://script.google.com/macros/s/AKfycbxi-x1Drl0zhK7eOg4o0hgDFFcI_-yK6YAfGgW46OOuhPTkzyLmxtKlt02wr_LTymljVQ/exec';
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (submit) submit.disabled = true;
    msg.textContent = 'TRANSMITTING...';
    fetch(scriptURL, { method: 'POST', body: new FormData(form) })
      .then(response => {
        if (!response.ok) throw new Error('Request failed');
        msg.textContent = 'MESSAGE RECEIVED. THANKS FOR CONTACTING US.';
        form.reset(); setTimeout(() => (msg.textContent = ''), 4000);
      })
      .catch(() => { msg.textContent = 'ERROR: We could not send your message. Please try again.'; })
      .finally(() => { if (submit) submit.disabled = false; });
  });
})();
