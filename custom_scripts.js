// initialize slideshows
function init_slideshow() {
    // get all slideshows
    const slideshows = document.getElementsByClassName('slideshow');
    console.log(`initializing ${slideshows.length} slideshows`)

    // add prev/next buttons to each slideshow
    for (let i = 0; i < slideshows.length; i++) {
        // get all images in slideshow
        const images = slideshows[i].getElementsByTagName('img');
        let index = 0;
        // create function to switch image
        function switch_image(x) {
            return () => {
                images[index].style.display = 'none';
                index = (index + x + images.length) % images.length;
                images[index].style.display = 'block';
            }
        }
        // add prev/next buttons
        prevButton = document.createElement('button');
        prevButton.className = 'prevButton';
        prevButton.innerHTML = '&#10094;';
        nextButton = document.createElement('button');
        nextButton.className = 'nextButton';
        nextButton.innerHTML = '&#10095;';
        slideshows[i].appendChild(prevButton);
        slideshows[i].appendChild(nextButton);
        prevButton.addEventListener('click', switch_image(-1));
        nextButton.addEventListener('click', switch_image(1));
        // show first image
        switch_image(0)();
    }
}

document.addEventListener('DOMContentLoaded', init_slideshow);


// use user preference for color scheme
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    if (window.localStorage.getItem("quarto-color-scheme") == null) {
        window.localStorage.setItem("quarto-color-scheme", "alternate");
    }
}
