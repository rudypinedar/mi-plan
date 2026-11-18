// Aplica el tema y el modo discreto antes de pintar (evita un parpadeo).
try{var t=localStorage.getItem("miplan.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);if(localStorage.getItem("miplan.discreet")==="1")document.documentElement.classList.add("discreet")}catch(e){}
