// general code for all slideshows
function init_slideshow() {
    const slideshows = document.getElementsByClassName('slideshow');
    console.log(`initializing ${slideshows.length} slideshows`)
    for (let i = 0; i < slideshows.length; i++) {
        const images = slideshows[i].getElementsByTagName('img');
        let index = 0;
        function switch_image(x) {
            return () => {
                images[index].style.display = 'none';
                index = (index + x + images.length) % images.length;
                images[index].style.display = 'block';
            }
        }
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
        switch_image(0)();
    }
}

init_slideshow();
