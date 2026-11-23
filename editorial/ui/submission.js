const form = document.querySelector('#paper');
const message = document.querySelector('#message');
let attempt = crypto.randomUUID();
form.addEventListener('input', () => { attempt = crypto.randomUUID(); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (form.elements.pdf.files[0].size > 5 * 1024 * 1024) {
    message.textContent = 'Choose a PDF of 5 MiB or smaller.';
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  message.textContent = 'Uploading your manuscript…';
  try {
    const response = await fetch('/api/papers/' + attempt, {method:'POST',body:new FormData(form)});
    if (!response.ok) throw new Error(response.status < 500 ? await response.text() : 'Upload could not be confirmed. Please retry.');
    const paper = await response.json();
    form.hidden = true;
    message.textContent = 'Received. Your reference is ' + paper.id + '. Bookmark the tracking link below.';
    const link = document.querySelector('#receipt');
    link.href = '/open-papers/status/?id=' + paper.id;
    link.hidden = false;
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
fetch('/api/session').then(r=>r.json()).then(session=>{
  if(!session.signedIn){document.querySelector('#login').hidden=false;form.hidden=true;}
}).catch(()=>{});
