/* ============================================================
   Datos de la Sección 1 — Mis Perfumes Favoritos
   Contenido estático: la tabla principal no depende de
   servicios externos ni de claves de API.
   ============================================================ */

const PERFUMES = [
  {
    nombre: "Prada L'Homme",
    casa: "Prada",
    ano: "2016",
    familia: ["amaderada"],
    salida: ["neroli", "pimienta negra", "cardamomo", "semillas de zanahoria"],
    corazon: ["iris", "violeta", "geranio", "mate"],
    fondo: ["ámbar", "cedro", "sándalo", "pachulí"],
    descripcion:
      "Un iris limpio y jabonoso apoyado en neroli brillante; la pimienta negra y el cardamomo " +
      "dan un chispa especiada breve antes de asentarse en un fondo pulcro de ámbar, cedro y sándalo. " +
      "Elegancia de camisa blanca: recién duchado, discreto y muy refinado.",
    duracion: "6–8 h",
    proyeccion: "Moderada (radio de un brazo, discreta)",
    ocasiones: ["día", "oficina", "calor"],
    uso: "Oficina, reuniones y uso diario; ideal en primavera y verano."
  },
  {
    nombre: "Afnan Turathi Blue",
    casa: "Afnan",
    ano: "2021",
    familia: ["amaderada", "cítrica"],
    salida: ["cítricos"],
    corazon: ["notas amaderadas", "ámbar"],
    fondo: ["almizcle", "especias", "pachulí"],
    descripcion:
      "Apertura cítrica y fresca que rápidamente se torna especiada y amaderada, con un corazón " +
      "de ámbar cálido y un fondo de almizcle y pachulí terroso. Intenso, con carácter y muy buen " +
      "rendimiento para su precio.",
    duracion: "7–9 h",
    proyeccion: "Fuerte las primeras 2–3 h, luego moderada",
    ocasiones: ["noche", "frío", "día"],
    uso: "Noche, salidas y días fríos; también funciona de día si no se sobraplica."
  },
  {
    nombre: "Jo Milano Game of Spades No Limit",
    casa: "Jo Milano",
    ano: "2020s",
    familia: ["oriental"],
    salida: ["cítricos"],
    corazon: ["iris", "amyris"],
    fondo: ["frijol tonka", "ámbar"],
    descripcion:
      "Cítricos breves que abren paso a un corazón cremoso de iris y amyris sobre un fondo dulzón " +
      "de frijol tonka y ámbar. Aterciopelado, elegante y envolvente, con guiños a los grandes " +
      "orientales amaderados de nicho.",
    duracion: "6–8 h",
    proyeccion: "Moderada-fuerte",
    ocasiones: ["noche", "frío"],
    uso: "Cenas, salidas nocturnas y clima frío; perfecto para vestir de noche."
  },
  {
    nombre: "Montblanc Starwalker",
    casa: "Montblanc",
    ano: "2005",
    familia: ["aromática"],
    salida: ["bambú", "bergamota", "mandarina"],
    corazon: ["almizcle blanco", "sándalo", "cedro"],
    fondo: ["jengibre", "resina de abeto", "nuez moscada", "ámbar"],
    descripcion:
      "Fresco y limpio de entrada gracias al bambú, la bergamota y la mandarina, con un corazón " +
      "suave de almizcle blanco y maderas; el jengibre y la nuez moscada aportan calidez al secado. " +
      "Un clásico inofensivo y versátil.",
    duracion: "5–7 h",
    proyeccion: "Suave-moderada, íntima",
    ocasiones: ["día", "oficina", "calor"],
    uso: "Oficina y uso diario; apañado para primavera y verano."
  },
  {
    nombre: "Louis Vuitton L'Immensité",
    casa: "Louis Vuitton",
    ano: "2018",
    familia: ["cítrica"],
    salida: ["pomelo", "bergamota", "jengibre"],
    corazon: ["romero", "salvia", "geranio", "notas acuáticas"],
    fondo: ["ambroxan", "ámbar", "ládano"],
    descripcion:
      "Pomelo y bergamota explotan en la salida con un jengibre efervescente; el corazón aromático " +
      "de romero, salvia y geranio flota sobre un fondo moderno de ambroxan, ámbar y ládano. " +
      "Fresco, caro y radiante de principio a fin.",
    duracion: "7–9 h",
    proyeccion: "Moderada-fuerte, constante",
    ocasiones: ["día", "oficina", "calor"],
    uso: "Día, oficina y clima cálido; también de noche en verano."
  },
  {
    nombre: "Rasasi Hawas Fire",
    casa: "Rasasi",
    ano: "2025",
    familia: ["cítrica", "aromática"],
    salida: ["salvia esclarea"],
    corazon: ["notas marinas", "jazmín egipcio"],
    fondo: ["ámbar", "notas minerales", "ámbar gris"],
    descripcion:
      "Salvia esclarea aromática y casi ahumada en la apertura, sobre un corazón marino y floral " +
      "de jazmín egipcio; el fondo de ámbar, notas minerales y ámbar gris le da un secado salino, " +
      "moderno y muy adictivo. El lado más intenso de la familia acuática.",
    duracion: "6–8 h",
    proyeccion: "Moderada",
    ocasiones: ["día", "calor"],
    uso: "Día y calor; estrella del verano, playa y tarde-noche veraniega."
  }
];
