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

El repositorio no incluye imágenes. Cada vez que alguien abre el sitio, este pide la imagen principal de la página del personaje a la API pública de [Fandom](https://www.fandom.com) o de [Wikipedia](https://en.wikipedia.org) y la muestra enlazada a su origen. Las imágenes pertenecen a sus respectivos dueños.

Si un personaje no muestra imagen, puedes fijar una a mano en `data.js` agregando el campo `img`:

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
