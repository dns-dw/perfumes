/* ============================================================
   Sección 1 — Renderizado de la tabla y filtros
   ============================================================ */

(function () {
  "use strict";

  const tbody = document.getElementById("tbody-perfumes");
  const tablaVacia = document.getElementById("tabla-vacia");
  const inputBusqueda = document.getElementById("buscar-tabla");

  const estado = {
    familia: "todas",
    ocasion: "todas",
    texto: ""
  };

  function escapar(texto) {
    const div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
  }

  function pastillas(lista, claseExtra) {
    return lista
      .map(function (n) {
        const cls = claseExtra ? "pastilla " + claseExtra : "pastilla";
        return '<span class="' + cls + '">' + escapar(n) + "</span>";
      })
      .join("");
  }

  function coincideTexto(p, texto) {
    if (!texto) return true;
    const aguja = texto.toLowerCase();
    const pajar = [
      p.nombre, p.casa, p.ano, p.descripcion, p.duracion, p.proyeccion, p.uso,
      p.salida.join(" "), p.corazon.join(" "), p.fondo.join(" ")
    ].join(" ").toLowerCase();
    return pajar.indexOf(aguja) !== -1;
  }

  function filtrar() {
    return PERFUMES.filter(function (p) {
      const okFamilia = estado.familia === "todas" || p.familia.indexOf(estado.familia) !== -1;
      const okOcasion = estado.ocasion === "todas" || p.ocasiones.indexOf(estado.ocasion) !== -1;
      return okFamilia && okOcasion && coincideTexto(p, estado.texto);
    });
  }

  function render() {
    const perfumes = filtrar();
    tablaVacia.hidden = perfumes.length > 0;

    tbody.innerHTML = perfumes.map(function (p) {
      return (
        "<tr>" +
        '<td class="col-perfume">' + escapar(p.nombre) + "</td>" +
        '<td class="col-casa">' + escapar(p.casa) + "</td>" +
        '<td class="col-ano">' + escapar(p.ano) + "</td>" +
        '<td class="notas">' + pastillas(p.salida) + "</td>" +
        '<td class="notas">' + pastillas(p.corazon) + "</td>" +
        '<td class="notas">' + pastillas(p.fondo) + "</td>" +
        "<td>" + escapar(p.descripcion) + "</td>" +
        '<td class="duracion">' + escapar(p.duracion) + "</td>" +
        "<td>" + escapar(p.proyeccion) + "</td>" +
        "<td>" + pastillas(p.ocasiones, "pastilla-ocasion") + "<br><small>" + escapar(p.uso) + "</small></td>" +
        "</tr>"
      );
    }).join("");
  }

  function activarBotones(contenedorId, attr, clave) {
    const contenedor = document.getElementById(contenedorId);
    contenedor.addEventListener("click", function (e) {
      const btn = e.target.closest(".btn-filtro");
      if (!btn) return;
      contenedor.querySelectorAll(".btn-filtro").forEach(function (b) {
        b.classList.toggle("activo", b === btn);
      });
      estado[clave] = btn.dataset[attr];
      render();
    });
  }

  activarBotones("filtro-familia", "familia", "familia");
  activarBotones("filtro-ocasion", "ocasion", "ocasion");

  inputBusqueda.addEventListener("input", function () {
    estado.texto = inputBusqueda.value.trim();
    render();
  });

  render();
})();
