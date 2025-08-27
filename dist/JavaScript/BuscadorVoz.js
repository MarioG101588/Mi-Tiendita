export function inicializarBuscadorVoz(inputId, btnId, onBuscar) {
  const campoBusqueda = document.getElementById(inputId);
  const btnVozBuscar = document.getElementById(btnId);

  // Función para normalizar texto y quitar tildes
  function normalizarTexto(texto) {
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  let recognition;
  if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = true;
  }

  btnVozBuscar.addEventListener('mousedown', () => {
    campoBusqueda.value = '';
    if (recognition) recognition.start();
  });

  if (recognition) {
    recognition.onresult = function(event) {
      let texto = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        texto += event.results[i][0].transcript;
      }
      // Normaliza el texto antes de ponerlo en el campo y filtrar
      campoBusqueda.value = normalizarTexto(texto);
      if (typeof onBuscar === 'function') onBuscar(normalizarTexto(texto));
    };
    recognition.onerror = function() {
      recognition.stop();
    };
    recognition.onend = function() {};
  }
}