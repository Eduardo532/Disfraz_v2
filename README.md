# Ponte el personaje

Guía interactiva de disfraces: 28 personajes alt, góticos y punk de cómic, anime, manhwa, videojuegos, animación y live action, ordenados del más fácil al más difícil de recrear.

## Qué hace

- **Medidor de dificultad:** elige hasta qué nivel (1 a 5) quieres ver.
- **Filtros por origen:** cómic, anime/manga, manhwa, videojuego, animación, live action.
- **Buscador** por personaje, obra o pieza clave.
- **Ficha de cada personaje** con descripción, ropa, pelo, maquillaje, accesorios y un consejo para que te reconozcan.
- **Checklist** para marcar lo que ya tienes; se guarda en tu navegador.
- **Elegir uno al azar** y enlaces directos a cada ficha (`index.html#mikasa`).

## Imágenes

El repositorio no incluye imágenes. Al abrir el sitio, cada personaje pide su imagen a las APIs públicas de [Fandom](https://www.fandom.com) y [Wikipedia](https://en.wikipedia.org), en este orden:

1. La imagen del recuadro de ficha (infobox) de su página en Fandom.
2. La imagen principal que Fandom asigna a esa página.
3. La imagen del recuadro de su artículo en Wikipedia.

Solo se consultan páginas del propio personaje, nunca la de la obra, para no mostrar pósters ni portadas. Cada imagen enlaza a su origen y pertenece a sus respectivos dueños.

Si una imagen no corresponde, en la ficha del personaje puedes tocar **Probar otra imagen** o **Usar una URL**. Esa elección se guarda en tu navegador. Para fijarla para todos los visitantes, agrega el campo `img` en `data.js`:

```js
{ id: "mai", name: "Mai", img: "https://ejemplo.com/mai.jpg", ... }
```

## Publicar con GitHub Pages

1. Sube estos archivos a un repositorio de GitHub.
2. Ve a **Settings → Pages**.
3. En **Source** elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`, y guarda.
4. En uno o dos minutos el sitio queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## Ver en local

No necesita compilación. Abre `index.html` en el navegador, o sirve la carpeta:

```bash
python3 -m http.server 8000
```

## Estructura

| Archivo | Contenido |
| --- | --- |
| `index.html` | Estructura de la página |
| `styles.css` | Estilos |
| `data.js` | Los 28 personajes y los niveles de dificultad |
| `app.js` | Filtros, buscador, fichas, checklist y carga de imágenes |

## Agregar un personaje

Copia una entrada de `data.js`, cambia sus datos y agrega en `sources` el subdominio de su wiki de Fandom (`f`) y el título de la página (`t`), o el título de Wikipedia (`wp`).
