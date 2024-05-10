# BEARS Website

This is the source code for the [website](https://www.bears-space.de/) of BEARS, the *Berlin Experimental Astronautics Research Student Team*, based at [TU Berlin](https://www.tu.berlin/).

The website is hosted using [Github Pages](https://pages.github.com/) and build using [Quarto](https://quarto.org/).


## Changing something

To add or change website content, locate the corresponsing `.qmd` file inside the [`website`](website/) folder and edit it. The content is specified using markdown - for more info, check out the [documentation](https://quarto.org/docs/authoring/markdown-basics.html). 

The simplest way to get started is by editing the file directly on GitHub by clicking on "edit in place" or "open with github.dev". When finished, commit / create a pull request and ask someone from the IT project group to review it. Alternatively, ask them to give you edit permission, so you can change things directly. Don't forget to check the website after a few minutes to make sure your changes look like they should!

To add a new project site, create a new folder inside [`website/projects`](website/projects/) and then create an `index.qmd` file inside. You can also add extra files like images to the newly created folder. A good way to get started is simply copying an existing project site and modifying it.


## Testing locally

To test the website locally on your own PC, you need to have [Quarto](https://quarto.org/docs/get-started/) installed. Then clone this repo e.g. using git or the GitHub App.

To preview the website, run `quarto preview` in the [`website`](website/) folder:

```bash
cd website
quarto preview
```
