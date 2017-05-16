/**
 * import-svg.js
 * Imports svgs from a given directory into svgjs/svgdom, draws
 * the rbox around the import, and exports the result into an HTML file.
 *
 * Usage: node svg-import.js
 * Note that the source directory is hard-coded.
 */
const window = require('svgdom');
const SVG = require('svg.js')(window);
const path = require('path');
const fs = require('fs');

const folder = 'full-batch';

/**
 * Reads svg files from a directory, imports the svgs into svg.js, and
 * writes all results into a single HTML file for visual inspection.
 */
const testGenerator = function() {
  // Generate one svg for every test file
  const testResults = [];
  const files = fs.readdirSync(path.join(__dirname, folder));
  for (const filename of files) {
    const svgString = fs.readFileSync(path.join(__dirname, folder, filename), 'utf-8');
    const svgInfo = createSvg(svgString);
    svgInfo.filename = filename;
    testResults.push(svgInfo);
  }

  // Build our html page - all svgs in one
  let html = '<!DOCTYPE html><html><head><meta charset = "utf-8"><title>nested-test</title></head>';
  html += '<body><table style=\"width:100%\"';
  for (var testResult of testResults) {
    html += `<tr style=\"width:100%\"><b>filename: ${testResult.filename}</b></tr><br />`;
    html += `<tr style=\"width:100%\">${testResult.svg}<br /></tr>`;
    html += `<tr style=\"width:100%\"><pre>rbox: ${JSON.stringify(testResult.rbox, null, '\t')}</pre><br /></tr>`;
    html += `<tr style=\"width:100%\"><br /></tr>`
    html += `<tr style=\"width:100%\"><br /></tr>`
  }
  html += '</table></body></html>';

  // Write everything to file
  const fileId = 'svg-import-test-' + Date.now() + '.html';
  fs.writeFileSync(path.join(__dirname, fileId), html);
};

/**
 * Creates an svg.js svg from a raw svg string
 * @param  {string} iconString The string to import into svg.js
 * @return {object}            Object containing the svg export, and its rbox
 */
const createSvg = function(iconString) {
//console.log('iconString: ' + iconString);
  // Basic setup
  const document = window.document;
  const draw = SVG(document.documentElement).size(600, 400).viewbox(0, 0, 600, 400);
  draw.clear();
  const background = draw.rect(600, 400).fill('#FFB030');

  // A temporary container for our import, and a group to transfer to
  const tempHolder = draw.symbol().svg(iconString);
  //console.log('tempHolder: ' + tempHolder);
  const finalGroup = draw.group();

  // Grab a reference to the imported svg
  const importedSvg = tempHolder.first();

  // Add all children recursively to group, then delete the temp holder
  addChildrenToNewParent(finalGroup, importedSvg);
  tempHolder.remove();

  // Grid lines for reference
  const xAxis = draw.line(0, 200, 600, 200).stroke({color: '#f06', width: 2});
  const yAxis = draw.line(300, 0, 300, 400).stroke({color: '#f06', width: 2});

  // Calculate the rbox of the group - needed to define our viewbox
  // Also experimented with bbox and plain rbox (no root) - same result
  const groupRbox = finalGroup.rbox(draw);

  // Setup the nested svg, add the group
  const nested = draw.nested().viewbox(groupRbox.x, groupRbox.y, groupRbox.width, groupRbox.height);
  nested.attr('preserveAspectRatio', 'xMidYMid meet');
  nested.add(finalGroup);

  // Give it a size, and move it around
  nested.size(150);
  if (nested.height() > 360) {
    nested.height(320);
  }
  nested.fill('white');
  nested.center(300, 200);

  // Calculate the rbox, store it, and draw it for visual inspection
  const rboxRoot = finalGroup.rbox();
  const rect = draw.rect(rboxRoot.w, rboxRoot.h).move(rboxRoot.x, rboxRoot.y)
  .fill('none').stroke({width: 2, color: '#1062B2'});

  return {svg: draw.svg(), rbox: rboxRoot};

  /**
   * Adds svg children to a new parent.
   * @param {object} finalParent  The new parent to add to
   * @param {object} sourceParent The original parent - can be any element
   */
  function addChildrenToNewParent(finalParent, sourceParent) {
    sourceParent.each(function(i, children) {
      // Add all children of the group recursively
      if (this.node.nodeName === 'g' && this.node.childNodes) {
        const newChildGroup = draw.group();
        // This handles an edge case where translate(1, -1) was used to flip
        // the image. Solution is not 100% accurate, but nearly.
        // See: abduction.svg
        if (this.transform().a === 1 && this.transform().d === -1) {
          newChildGroup.rotate(180, this.bbox().w/2, this.bbox().h/2);
        }
        addChildrenToNewParent(newChildGroup, this);
        finalParent.add(newChildGroup);
      }
      // if (this.node.nodeName === 'switch') {
      //   // TODO: Find a way to recreate/flatten <switch> nodes
      // }

      // If there are elements/shapes in the defs, in all tested cases this means
      // that there will be a <use> tag. svgdom was not handling this def-use
      // combo correctly, so we opted for flattening all the shapes entirely,
      // and affixing them to the parent node.
      // For defs with only <style>, we copy as is.
      if (this.node.nodeName === 'defs') {
        let oldDefs = finalParent.defs();
        let styleText, styleAttrs;
        oldDefs.each(function(i, children) {
          // Flatten any groups inside the defs, send them to the root parent
          if (this.node.nodeName === 'g') {
            this.ungroup(finalParent);
          }
          // Clone any shapes, and put them in the final parent
          if (this.node.nodeName === 'circle' || this.node.nodeName === 'rect'
           || this.node.nodeName === 'ellipse' || this.node.nodeName === 'polygon'
           || this.node.nodeName === 'path' || this.node.nodeName === 'polyline') {
             let clone = this.clone();
             draw.add(clone);
           }
          // If there is a style tag, delete the old defs to recreate them
          if (this.node.nodeName === 'style') {
            styleText = this.node.childNodes[0].nodeName;
            styleAttrs = this.node.attrs;
            this.remove();
          }
        });
        // Recreate <defs><style></style></defs> from the ground up
        // This is the only way I've found of keeping the text inside the
        // style tags...
        if (styleText) {
          let newDefs = finalParent.defs();
          let style = newDefs.element('style');
          style.words(styleText);
          if (styleAttrs) {
            style.node.attrs = styleAttrs;
          }
          finalParent.add(newDefs);
        }
      }
      // Shapes are simply added to the parent - easy
      if (this.node.nodeName === 'circle' || this.node.nodeName === 'rect'
       || this.node.nodeName === 'ellipse' || this.node.nodeName === 'polygon'
       || this.node.nodeName === 'path' || this.node.nodeName === 'polyline') {
         finalParent.add(this);
       }
      // Reset relative transformations
      if (this.transform().transformedX !== 0
       && this.transform().transformedX === this.transform().x) {
        this.transform({x: 0});
      }
      if (this.transform().transformedY !== 0
       && this.transform().transformedY === this.transform().y) {
        this.transform({y: 0});
      }
    });
  }
}

testGenerator();
