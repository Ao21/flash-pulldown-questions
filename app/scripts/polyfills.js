/*!
 * Polyfill.js - v0.1.0
 *
 * Copyright (c) 2015 Philip Walton <http://philipwalton.com>
 * Released under the MIT license
 *
 * Date: 2015-06-21
 */
;(function(window, document, undefined){

'use strict';

var reNative = RegExp('^' +
  String({}.valueOf)
    .replace(/[.*+?\^${}()|\[\]\\]/g, '\\$&')
    .replace(/valueOf|for [^\]]+/g, '.+?') + '$'
)


/**
 * Trim any leading or trailing whitespace
 */
function trim(s) {
  return s.replace(/^\s+|\s+$/g,'')
}


/**
 * Detects the presence of an item in an array
 */
function inArray(target, items) {
  var item
    , i = 0
  if (!target || !items) return false
  while(item = items[i++]) {
    if (target === item) return true
  }
  return false
}


/**
 * Determine if a method is support natively by the browser
 */
function isNative(fn) {
  return reNative.test(fn)
}

/**
 * Determine if a URL is local to the document origin
 * Inspired form Respond.js
 * https://github.com/scottjehl/Respond/blob/master/respond.src.js#L90-L91
 */
var isLocalURL = (function() {
  var base = document.getElementsByTagName("base")[0]
    , reProtocol = /^([a-zA-Z:]*\/\/)/
  return function(url) {
    var isLocal = (!reProtocol.test(url) && !base)
      || url.replace(RegExp.$1, "").split("/")[0] === location.host
    return isLocal
  }
}())

var supports = {
  // true with either native support or a polyfil, we don't care which
  matchMedia: window.matchMedia && window.matchMedia( "only all" ).matches,
  // true only if the browser supports window.matchMeida natively
  nativeMatchMedia: isNative(window.matchMedia)
}

var DownloadManager = (function() {

  var cache = {}
    , queue = []
    , callbacks = []
    , requestCount = 0
    , xhr = (function() {
        var method
        try { method = new window.XMLHttpRequest() }
        catch (e) { method = new window.ActiveXObject( "Microsoft.XMLHTTP" ) }
        return method
      }())

  // return function(urls, callback) {

  function addURLsToQueue(urls) {
    var url
      , i = 0
    while (url = urls[i++]) {
      if (!cache[url] && !inArray(url, queue)) {
        queue.push(url)
      }
    }
  }

  function processQueue() {
    // don't process the next one if we're in the middle of a download
    if (!(xhr.readyState === 0 || xhr.readyState === 4)) return

    var url
    if (url = queue[0]) {
      downloadStylesheet(url)
    }
    if (!url) {
      invokeCallbacks()
    }
  }

  /**
   * Make the requests
   *
   * TODO: Get simultaneous downloads working, it can't be that hard
  */
  function downloadStylesheet(url) {
    requestCount++
    xhr.open("GET", url, true)
    xhr.onreadystatechange = function () {
      if (xhr.readyState == 4 && (xhr.status == 200 || xhr.status == 304)) {
        cache[url] = xhr.responseText
        queue.shift()
        processQueue()
      }
    }
    xhr.send(null)
  }

  /**
   * Check the cache to make sure all requests are complete
   */
  function downloadsFinished(urls) {
    var url
      , i = 0
      , len = 0
    while (url = urls[i++]) {
      if (cache[url]) len++
    }
    return (len === urls.length)
  }

  /**
   * Invoke each callback and remove it from the list
   */
  function invokeCallbacks() {
    var callback
    while (callback = callbacks.shift()) {
      invokeCallback(callback.urls, callback.fn)
    }
  }

  /**
   * Put the stylesheets in the proper order and invoke the callback
   */
  function invokeCallback(urls, callback) {
    var stylesheets = []
      , url
      , i = 0
    while (url = urls[i++]) {
      stylesheets.push(cache[url])
    }
    callback.call(null, stylesheets)
  }

  return {
    request: function(urls, callback) {
      // Add the callback to the list
      callbacks.push({urls: urls, fn: callback})

      if (downloadsFinished(urls)) {
        invokeCallbacks()
      } else {
        addURLsToQueue(urls)
        processQueue()
      }
    },
    clearCache: function() {
      cache = {}
    },
    _getRequestCount: function() {
      return requestCount
    }
  }

}())

var StyleManager = {

  _cache: {},

  clearCache: function() {
    StyleManager._cache = {}
  },

  /**
   * Parse a string of CSS
   * optionaly pass an identifier for caching
   *
   * Adopted from TJ Holowaychuk's
   * https://github.com/visionmedia/css-parse
   *
   * Minor changes include removing the "stylesheet" root and
   * using String.charAt(i) instead of String[i] for IE7 compatibility
   */
  parse: function(css, identifier) {

    /**
     * Opening brace.
     */
    function open() {
      return match(/^\{\s*/)
    }

    /**
     * Closing brace.
     */
    function close() {
      return match(/^\}\s*/)
    }

    /**
     * Parse ruleset.
     */
    function rules() {
      var node
      var rules = []
      whitespace()
      comments(rules)
      while (css.charAt(0) != '}' && (node = atrule() || rule())) {
        rules.push(node)
        comments(rules)
      }
      return rules
    }

    /**
     * Match `re` and return captures.
     */
    function match(re) {
      var m = re.exec(css)
      if (!m) return
      css = css.slice(m[0].length)
      return m
    }

    /**
     * Parse whitespace.
     */
    function whitespace() {
      match(/^\s*/)
    }

    /**
     * Parse comments
     */
    function comments(rules) {
      rules = rules || []
      var c
      while (c = comment()) rules.push(c)
      return rules
    }

    /**
     * Parse comment.
     */
    function comment() {
      if ('/' == css[0] && '*' == css[1]) {
        var i = 2
        while ('*' != css[i] || '/' != css[i + 1]) ++i
        i += 2
        var comment = css.slice(2, i - 2)
        css = css.slice(i)
        whitespace()
        return { comment: comment }
      }
    }

    /**
     * Parse selector.
     */
    function selector() {
      var m = match(/^([^{]+)/)
      if (!m) return
      return trim(m[0]).split(/\s*,\s*/)
    }

    /**
     * Parse declaration.
     */
    function declaration() {
      // prop
      var prop = match(/^(\*?[\-\w]+)\s*/)
      if (!prop) return
      prop = prop[0]

      // :
      if (!match(/^:\s*/)) return

      // val
      var val = match(/^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^\)]*?\)|[^};])+)\s*/)
      if (!val) return
      val = trim(val[0])

      //
      match(/^[;\s]*/)

      return { property: prop, value: val }
    }

    /**
     * Parse keyframe.
     */
    function keyframe() {
      var m
      var vals = []

      while (m = match(/^(from|to|\d+%|\.\d+%|\d+\.\d+%)\s*/)) {
        vals.push(m[1])
        match(/^,\s*/)
      }

      if (!vals.length) return

      return {
        values: vals,
        declarations: declarations()
      }
    }

    /**
     * Parse keyframes.
     */
    function keyframes() {
      var m = match(/^@([\-\w]+)?keyframes */)
      if (!m) return
      var vendor = m[1]

      // identifier
      var m = match(/^([\-\w]+)\s*/)
      if (!m) return
      var name = m[1]

      if (!open()) return
      comments()

      var frame
      var frames = []
      while (frame = keyframe()) {
        frames.push(frame)
        comments()
      }

      if (!close()) return

      var obj = {
        name: name,
        keyframes: frames
      }
      // don't include vendor unles there's a match
      if (vendor) obj.vendor = vendor

      return obj
    }

    /**
     * Parse supports.
     */
    function supports() {
      var m = match(/^@supports *([^{]+)/)
      if (!m) return
      var supports = trim(m[1])

      if (!open()) return
      comments()

      var style = rules()

      if (!close()) return

      return { supports: supports, rules: style }
    }

    /**
     * Parse media.
     */
    function media() {
      var m = match(/^@media *([^{]+)/)
      if (!m) return

      var media = trim(m[1])

      if (!open()) return
      comments()

      var style = rules()

      if (!close()) return

      return { media: media, rules: style }
    }


    /**
     * Parse paged media.
     */
    function atpage() {
      var m = match(/^@page */)
      if (!m) return

      var sel = selector() || []
      var decls = []

      if (!open()) return
      comments()

      // declarations
      var decl
      while (decl = declaration() || atmargin()) {
        decls.push(decl)
        comments()
      }

      if (!close()) return

      return {
        type: "page",
        selectors: sel,
        declarations: decls
      }
    }

    /**
     * Parse margin at-rules
     */
    function atmargin() {
      var m = match(/^@([a-z\-]+) */)
      if (!m) return
      var type = m[1]

      return {
        type: type,
        declarations: declarations()
      }
    }

    /**
     * Parse import
     */
    function atimport() {
      return _atrule('import')
    }

    /**
     * Parse charset
     */
    function atcharset() {
      return _atrule('charset')
    }

    /**
     * Parse namespace
     */
    function atnamespace() {
      return _atrule('namespace')
    }

    /**
     * Parse non-block at-rules
     */
    function _atrule(name) {
      var m = match(new RegExp('^@' + name + ' *([^;\\n]+);\\s*'))
      if (!m) return
      var ret = {}
      ret[name] = trim(m[1])
      return ret
    }

    /**
     * Parse declarations.
     */
    function declarations() {
      var decls = []

      if (!open()) return
      comments()

      // declarations
      var decl
      while (decl = declaration()) {
        decls.push(decl)
        comments()
      }

      if (!close()) return
      return decls
    }

    /**
     * Parse at rule.
     */
    function atrule() {
      return keyframes()
        || media()
        || supports()
        || atimport()
        || atcharset()
        || atnamespace()
        || atpage()
    }

    /**
     * Parse rule.
     */
    function rule() {
      var sel = selector()
      if (!sel) return
      comments()
      return { selectors: sel, declarations: declarations() }
    }

    /**
     * Check the cache first, otherwise parse the CSS
     */
    if (identifier && StyleManager._cache[identifier]) {
      return StyleManager._cache[identifier]
    } else {
      // strip comments before parsing
      css = css.replace(/\/\*[\s\S]*?\*\//g, "")
      return StyleManager._cache[identifier] = rules()
    }

  },

  /**
   * Filter a ruleset by the passed keywords
   * Keywords may be either selector or property/value patterns
   */
  filter: function(rules, keywords) {

    var filteredRules = []

    /**
     * Concat a2 onto a1 even if a1 is undefined
     */
    function safeConcat(a1, a2) {
      if (!a1 && !a2) return
      if (!a1) return [a2]
      return a1.concat(a2)
    }

    /**
     * Add a rule to the filtered ruleset,
     * but don't add empty media or supports values
     */
    function addRule(rule) {
      if (rule.media == null) delete rule.media
      if (rule.supports == null) delete rule.supports
      filteredRules.push(rule)
    }

    function containsKeyword(string, keywordList) {
      if (!keywordList) return
      var i = keywordList.length
      while (i--) {
        if (string.indexOf(keywordList[i]) >= 0) return true
      }
    }

    function matchesKeywordPattern(declaration, patternList) {
      var wildcard = /\*/
        , pattern
        , parts
        , reProp
        , reValue
        , i = 0
      while (pattern = patternList[i++]) {
        parts = pattern.split(":")
        reProp = new RegExp("^" + trim(parts[0]).replace(wildcard, ".*") + "$")
        reValue = new RegExp("^" + trim(parts[1]).replace(wildcard, ".*") + "$")
        if (reProp.test(declaration.property) && reValue.test(declaration.value)) {
          return true
        }
      }
    }

    function matchSelectors(rule, media, supports) {
      if (!keywords.selectors) return

      if (containsKeyword(rule.selectors.join(","), keywords.selectors)) {
        addRule({
          media: media,
          supports: supports,
          selectors: rule.selectors,
          declarations: rule.declarations
        })
        return true
      }
    }

    function matchesDeclaration(rule, media, supports) {
      if (!keywords.declarations) return
      var declaration
        , i = 0
      while (declaration = rule.declarations[i++]) {
        if (matchesKeywordPattern(declaration, keywords.declarations)) {
          addRule({
            media: media,
            supports: supports,
            selectors: rule.selectors,
            declarations: rule.declarations
          })
          return true
        }
      }
    }

    function filterRules(rules, media, supports) {
      var rule
        , i = 0
      while (rule = rules[i++]) {
        if (rule.declarations) {
          matchSelectors(rule, media, supports) || matchesDeclaration(rule, media, supports)
        }
        else if (rule.rules && rule.media) {
          filterRules(rule.rules, safeConcat(media, rule.media), supports)
        }
        else if (rule.rules && rule.supports) {
          filterRules(rule.rules, media, safeConcat(supports, rule.supports))
        }
      }

    }

    // start the filtering
    filterRules(rules)

    // return the results
    return filteredRules

  }
}
var MediaManager = (function() {

  var reMinWidth = /\(min\-width:[\s]*([\s]*[0-9\.]+)(px|em)[\s]*\)/
    , reMaxWidth = /\(max\-width:[\s]*([\s]*[0-9\.]+)(px|em)[\s]*\)/

    // a cache of the active media query info
    , mediaQueryMap = {}

    // the value of an `em` as used in a media query,
    // not necessarily the base font-size
    , emValueInPixels
    , currentWidth

  /**
   * Get the pixel value of 1em for use in parsing media queries
   * ems in media queries are not affected by CSS, instead they
   * are the value of the browsers default font size, usually 16px
   */
  function getEmValueInPixels() {

    // cache this value because it probably won't change and
    // it's expensive to lookup
    if (emValueInPixels) return emValueInPixels

    var html = document.documentElement
      , body = document.body
      , originalHTMLFontSize = html.style.fontSize
      , originalBodyFontSize = body.style.fontSize
      , div = document.createElement("div")

    // 1em is the value of the default font size of the browser
    // reset html and body to ensure the correct value is returned
    html.style.fontSize = "1em"
    body.style.fontSize = "1em"

    // add a test element and measure it
    body.appendChild(div)
    div.style.width = "1em"
    div.style.position = "absolute"
    emValueInPixels = div.offsetWidth

    // remove the test element and restore the previous values
    body.removeChild(div)
    body.style.fontSize = originalBodyFontSize
    html.style.fontSize = originalHTMLFontSize

    return emValueInPixels
  }

  /**
   * Use the browsers matchMedia function or existing shim
   */
  function matchMediaNatively(query) {
    return window.matchMedia(query)
  }

  /**
   * Try to determine if a mediaQuery matches by
   * parsing the query and figuring it out manually
   * TODO: cache current width for repeated invocations
   */
  function matchMediaManually(query) {
    var minWidth
      , maxWidth
      , matches = false

    // recalculate the width if it's not set
    // if (!currentWidth) currentWidth = document.documentElement.clientWidth
    currentWidth = document.documentElement.clientWidth

    // parse min and max widths from query
    if (reMinWidth.test(query)) {
      minWidth = RegExp.$2 === "em"
        ? parseFloat(RegExp.$1) * getEmValueInPixels()
        : parseFloat(RegExp.$1)
    }
    if (reMaxWidth.test(query)) {
      maxWidth = RegExp.$2 === "em"
        ? parseFloat(RegExp.$1) * getEmValueInPixels()
        : parseFloat(RegExp.$1)
    }

    // if both minWith and maxWidth are set
    if (minWidth && maxWidth) {
      matches = (minWidth <= currentWidth && maxWidth >= currentWidth)
    } else {
      if (minWidth && minWidth <= currentWidth) matches = true
      if (maxWidth && maxWidth >= currentWidth) matches = true
    }

    // return fake MediaQueryList object
    return {
      matches: matches,
      media: query
    }
  }


  return {
    /**
     * Similar to the window.matchMedia method
     * results are cached to avoid expensive relookups
     * @returns MediaQueryList (or a faked one)
     */
    matchMedia: function(query) {
      return supports.matchMedia
          ? matchMediaNatively(query)
          : matchMediaManually(query)
      // return mediaQueryMap[query] || (
      //   mediaQueryMap[query] = supports.matchMedia
      //     ? matchMediaNatively(query)
      //     : matchMediaManually(query)
      // )
    },

    clearCache: function() {
      // we don't use cache when the browser supports matchMedia listeners
      if (!supports.nativeMatchMedia) {
        currentWidth = null
        mediaQueryMap = {}
      }
    }
  }

}())

var EventManager = (function() {

  var MediaListener = (function() {
    var listeners = []
    return {
      add: function(polyfill, mql, fn) {
        var listener
          , i = 0
        // if the listener is already in the array, return false
        while (listener = listeners[i++]) {
          if (
            listener.polyfill == polyfill
            && listener.mql === mql
            && listener.fn === fn
          ) {
            return false
          }
        }
        // otherwise add it
        mql.addListener(fn)
        listeners.push({
          polyfill: polyfill,
          mql: mql,
          fn: fn
        })
      },
      remove: function(polyfill) {
        var listener
          , i = 0
        while (listener = listeners[i++]) {
          if (listener.polyfill === polyfill) {
            listener.mql.removeListener(listener.fn)
            listeners.splice(--i, 1)
          }
        }
      }
    }
  }())

  var ResizeListener = (function(listeners) {
    function onresize() {
      var listener
        , i = 0
      while (listener = listeners[i++]) {
        listener.fn()
      }
    }
    return {
      add: function(polyfill, fn) {
        if (!listeners.length) {
          if (window.addEventListener) {
            window.addEventListener("resize", onresize, false)
          } else {
            window.attachEvent("onresize", onresize)
          }
        }
        listeners.push({
          polyfill: polyfill,
          fn: fn
        })

      },
      remove: function(polyfill) {
        var listener
          , i = 0
        while (listener = listeners[i++]) {
          if (listener.polyfill === polyfill) {
            listeners.splice(--i, 1)
          }
        }
        if (!listeners.length) {
          if (window.removeEventListener) {
            window.removeEventListener("resize", onresize, false)
          } else if (window.detachEvent) {
            window.detachEvent("onresize", onresize)
          }
        }
      }
    }
  }([]))


  /**
   * Simple debounce function
   */
  function debounce(fn, wait) {
    var timeout
    return function() {
      clearTimeout(timeout)
      timeout = setTimeout(fn, wait)
    }
  }

  return {

    removeListeners: function(polyfill) {
      supports.nativeMatchMedia
        ? MediaListener.remove(polyfill)
        : ResizeListener.remove(polyfill)
    },

    addListeners: function(polyfill, callback) {

      var queries = polyfill._mediaQueryMap
        , state = {}


      /**
       * Set up initial state
       */
      ;(function() {
        for (var query in queries) {
          if (!queries.hasOwnProperty(query)) continue
          state[query] = MediaManager.matchMedia(query).matches
        }
      }())

      /**
       * Register the listeners to detect media query changes
       * if the browser doesn't support this natively, use resize events instead
       */
      function addListeners() {

        if (supports.nativeMatchMedia) {
          for (var query in queries) {
            if (queries.hasOwnProperty(query)) {
              // a closure is needed here to keep the variable reference
              (function(mql, query) {
                MediaListener.add(polyfill, mql, function() {
                  callback.call(polyfill, query, mql.matches)
                })
              }(queries[query], query))
            }
          }
        } else {

          var fn = debounce((function(polyfill, queries) {
            return function() {
              updateMatchedMedia(polyfill, queries)
            }
          }(polyfill, queries)), polyfill._options.debounceTimeout || 100)

          ResizeListener.add(polyfill, fn)

        }
      }

      /**
       * Check each media query to see if it still matches
       * Note: this is only invoked when the browser doesn't
       * natively support window.matchMedia addListeners
       */
      function updateMatchedMedia(polyfill, queries) {
        var query
          , current = {}

        // clear the cache since a resize just happened
        MediaManager.clearCache()

        // look for media matches that have changed since the last inspection
        for (query in queries) {
          if (!queries.hasOwnProperty(query)) continue
          current[query] = MediaManager.matchMedia(query).matches
          if (current[query] != state[query]) {
            callback.call(polyfill, query, MediaManager.matchMedia(query).matches)
          }
        }
        state = current
      }

      addListeners()

    }

  }

}())

function Ruleset(rules) {
  var i = 0
    , rule
  this._rules = []
  while (rule = rules[i++]) {
    this._rules.push(new Rule(rule))
  }
}

Ruleset.prototype.each = function(iterator, context) {
  var rule
    , i = 0
  context || (context = this)
  while (rule = this._rules[i++]) {
    iterator.call(context, rule)
  }
}

Ruleset.prototype.size = function() {
  return this._rules.length
}

Ruleset.prototype.at = function(index) {
  return this._rules[index]
}

function Rule(rule) {
  this._rule = rule
}

Rule.prototype.getDeclaration = function() {
  var styles = {}
    , i = 0
    , declaration
    , declarations = this._rule.declarations
  while (declaration = declarations[i++]) {
    styles[declaration.property] = declaration.value
  }
  return styles
}

Rule.prototype.getSelectors = function() {
  return this._rule.selectors.join(", ")
}

Rule.prototype.getMedia = function() {
  return this._rule.media.join(" and ")
}

function Polyfill(options) {

  if (!(this instanceof Polyfill)) return new Polyfill(options)

  // set the options
  this._options = options

  // allow the keywords option to be the only object passed
  if (!options.keywords) this._options = { keywords: options }

  this._promise = []

  // then do the stuff
  this._getStylesheets()
  this._downloadStylesheets()
  this._parseStylesheets()
  this._filterCSSByKeywords()
  this._buildMediaQueryMap()
  this._reportInitialMatches()
  this._addMediaListeners()
}


/**
 * Fired when the media change and new rules match
 */
Polyfill.prototype.doMatched = function(fn) {
  this._doMatched = fn
  this._resolve()
  return this
}


/**
 * Fired when the media changes and previously matching rules no longer match
 */
Polyfill.prototype.undoUnmatched = function(fn) {
  this._undoUnmatched = fn
  this._resolve()
  return this
}


/**
 * Get all the rules the match the current media
 */
Polyfill.prototype.getCurrentMatches = function() {
  var i = 0
    , rule
    , media
    , matches = []
  while (rule = this._filteredRules[i++]) {
    // rules are considered matches if they they have
    // no media query or the media query curently matches
    media = rule.media && rule.media.join(" and ")
    if (!media || MediaManager.matchMedia(media).matches) {
      matches.push(rule)
    }
  }
  return new Ruleset(matches)
}


/**
 * Destroy the instance
 * Remove any bound events and send all current
 * matches to the callback as unmatches
 */
Polyfill.prototype.destroy = function() {
  if (this._undoUnmatched) {
    this._undoUnmatched(this.getCurrentMatches())
    EventManager.removeListeners(this)
  }
  return
}


/**
 * Defer a task until after a condition is met
 */
Polyfill.prototype._defer = function(condition, callback) {
  condition.call(this)
    ? callback.call(this)
    : this._promise.push({condition: condition, callback: callback})
}


/**
 * Invoke any functions that have been deferred
 */
Polyfill.prototype._resolve = function() {
  var promise
    , i = 0
  while (promise = this._promise[i]) {
    if (promise.condition.call(this)) {
      this._promise.splice(i, 1)
      promise.callback.call(this)
    } else {
      i++
    }
  }
}


/**
 * Get a list of <link> tags in the head
 * optionally filter by the include/exclude options
 */
Polyfill.prototype._getStylesheets = function() {
  var i = 0
    , id
    , ids
    , link
    , links
    , inline
    , inlines
    , stylesheet
    , stylesheets = []

  if (this._options.include) {
    // get only the included stylesheets link tags
    ids = this._options.include
    while (id = ids[i++]) {
      if (link = document.getElementById(id)) {
        // if this tag is an inline style
        if (link.nodeName === "STYLE") {
          stylesheet = { text: link.textContent }
          stylesheets.push(stylesheet)
          continue
        }
        // ignore print stylesheets
        if (link.media && link.media == "print") continue
        // ignore non-local stylesheets
        if (!isLocalURL(link.href)) continue
        stylesheet = { href: link.href }
        link.media && (stylesheet.media = link.media)
        stylesheets.push(stylesheet)
      }
    }
  }
  else {
    // otherwise get all the stylesheets stylesheets tags
    // except the explicitely exluded ones
    ids = this._options.exclude
    links = document.getElementsByTagName( "link" )
    while (link = links[i++]) {
      if (
        link.rel
        && (link.rel == "stylesheet")
        && (link.media != "print") // ignore print stylesheets
        && (isLocalURL(link.href)) // only request local stylesheets
        && (!inArray(link.id, ids))
      ) {
        stylesheet = { href: link.href }
        link.media && (stylesheet.media = link.media)
        stylesheets.push(stylesheet)
      }
    }
    inlines = document.getElementsByTagName('style');
    i = 0;
    while (inline = inlines[i++]){
      stylesheet = { text: inline.textContent }
      stylesheets.push(stylesheet);
    }
  }
  return this._stylesheets = stylesheets
}


/**
 * Download each stylesheet in the _stylesheetURLs array
 */
Polyfill.prototype._downloadStylesheets = function() {
  var self = this
    , stylesheet
    , urls = []
    , i = 0
  while (stylesheet = this._stylesheets[i++]) {
    urls.push(stylesheet.href)
  }
  DownloadManager.request(urls, function(stylesheets) {
    var stylesheet
      , i = 0
    while (stylesheet = stylesheets[i]) {
      self._stylesheets[i++].text = stylesheet
    }
    self._resolve()
  })
}

Polyfill.prototype._parseStylesheets = function() {
  this._defer(
    function() {
      return this._stylesheets
        && this._stylesheets.length
        && this._stylesheets[0].text },
    function() {
      var i = 0
        , stylesheet
      while (stylesheet = this._stylesheets[i++]) {
        stylesheet.rules = StyleManager.parse(stylesheet.text, stylesheet.url)
      }
    }
  )
}

Polyfill.prototype._filterCSSByKeywords = function() {
  this._defer(
    function() {
      return this._stylesheets
        && this._stylesheets.length
        && this._stylesheets[0].rules
    },
    function() {
      var stylesheet
        , media
        , rules = []
        , i = 0
      while (stylesheet = this._stylesheets[i++]) {
        media = stylesheet.media
        // Treat stylesheets with a media attribute as being contained inside
        // a single @media block, but ignore `all` and `screen` media values
        // since they're basically meaningless in this context
        if (media && media != "all" && media != "screen") {
          rules.push({rules: stylesheet.rules, media: stylesheet.media})
        } else {
          rules = rules.concat(stylesheet.rules)
        }
      }
      this._filteredRules = StyleManager.filter(rules, this._options.keywords)
    }
  )
}

Polyfill.prototype._buildMediaQueryMap = function() {
  this._defer(
    function() { return this._filteredRules },
    function() {
      var i = 0
        , media
        , rule
      this._mediaQueryMap = {}
      while (rule = this._filteredRules[i++]) {
        if (rule.media) {
          media = rule.media.join(" and ")
          this._mediaQueryMap[media] = MediaManager.matchMedia(media)
        }
      }
    }
  )
}

Polyfill.prototype._reportInitialMatches = function() {
  this._defer(
    function() {
      return this._filteredRules && this._doMatched
    },
    function() {
      this._doMatched(this.getCurrentMatches())
    }
  )
}

Polyfill.prototype._addMediaListeners = function() {
  this._defer(
    function() {
      return this._filteredRules
        && this._doMatched
        && this._undoUnmatched
    },
    function() {
      EventManager.addListeners(
        this,
        function(query, isMatch) {
          var i = 0
            , rule
            , matches = []
            , unmatches = []
          while (rule = this._filteredRules[i++]) {
            if (rule.media && rule.media.join(" and ") == query) {
              (isMatch ? matches : unmatches).push(rule)
            }
          }
          matches.length && this._doMatched(new Ruleset(matches))
          unmatches.length && this._undoUnmatched(new Ruleset(unmatches))
        }
      )
    }
  )
}

Polyfill.modules = {
  DownloadManager: DownloadManager,
  StyleManager: StyleManager,
  MediaManager: MediaManager,
  EventManager: EventManager
}
Polyfill.constructors = {
  Ruleset: Ruleset,
  Rule: Rule
}

window.Polyfill = Polyfill

}(window, document));


(function(w, doc, undefined) {
  // Enable strict mode
  'use strict';

  /*
   * alias
   * w: window global object
   * doc: document
   * undefined: undefined
   */

    /**
     * constraint to jumping to the next snap-point.
     * when scrolling further than SNAP_CONSTRAINT snap-points,
     * but the current distance is less than 1-0.18 (read: 18 percent),
     * the snap-will go back to the closer snap-point.
     */
  var CONSTRAINT = 1-0.18,
      /*
       * if scrolling for one snap-point only,
       * the scroll distance must be at least 5% of the scroll-width.
       */
      FIRST_CONSTRAINT = 1-0.05,

      /*
       * minimum scroll distance in pixel
       */
      MIN_PX_CONSTRAINT = 5,

      /**
       * when scrolling for more than SNAP_CONSTRAINT snap points,
       * a constraint is applied for scrolling to snap points in the distance.
       * @type {Number}
       */
      SNAP_CONSTRAINT = 2,

      /**
       * time in ms after which scrolling is considered finished.
       * the scroll timeouts are timed with this.
       * whenever a new scroll event is triggered, the previous timeout is deleted.
       * @type {Number}
       */
      SCROLL_TIMEOUT = 45,

      /**
       * time for the smooth scrolling
       * @type {Number}
       */
      SCROLL_TIME = 768;

  /**
   * Feature detect scroll-snap-type, if it exists then do nothing (return)
   */
  if ('scrollSnapType' in doc.documentElement.style ||
      'webkitScrollSnapType' in doc.documentElement.style ||
      'msScrollSnapType' in doc.documentElement.style) {
    // just return void to stop executing the polyfill.
    return;
  }

  /**
   * doMatched is a callback for Polyfill to fill in the desired behaviour.
   * @param  {array} rules rules found for the polyfill
   */
  function doMatched(rules) {
    // iterate over rules
    rules.each(function(rule) {

      var elements = doc.querySelectorAll(rule.getSelectors()),
          declaration = rule.getDeclaration();

      // iterate over elements
      [].forEach.call(elements, function(obj) {
        // set up the behaviour
        setUpElement(obj, declaration);
      });
    });
  }

  /**
   * unDomatched is a callback for polyfill to undo any polyfilled behaviour
   * @param  {Object} rules
   */
  function undoUnmatched(rules) {
    // iterate over rules
    rules.each(function(rule) {
      var elements = doc.querySelectorAll(rule.getSelectors());

      // iterate over elements
      [].forEach.call(elements, function(item) {
        // tear down the behaviour
        tearDownElement(item);
      });
    });
  }

  /**
   * set up an element for scroll-snap behaviour
   * @param {Object} obj         HTML element
   * @param {Object} declaration CSS declarations
   */
  function setUpElement(obj, declaration) {
    // if this is a scroll-snap element in a scroll snap container, attach to the container only.
    if (typeof declaration['scroll-snap-coordinate'] !== 'undefined') {
      // save declaration
      obj.snapLengthUnit = parseSnapCoordValue(declaration);

      return attachToScrollParent(obj);
    }

    // if the scroll snap attributes are applied on the body/html tag, use the doc for scroll events.
    var tag = obj.tagName;
    if (tag.toLowerCase() == "body" ||
        tag.toLowerCase() == "html") {
      obj = doc;
    }

    // add the event listener
    obj.addEventListener('scroll', handler, false);

    // save declaration
    if (typeof declaration['scroll-snap-destination'] !== 'undefined') {
      obj.snapLengthUnit = parseSnapCoordValue(declaration);
    } else {
      obj.snapLengthUnit = parseSnapPointValue(declaration);
    }

    // init possible elements
    obj.snapElements = [];
  }

  /**
   * tear down an element. remove all added behaviour.
   * @param  {Object} obj DomElement
   */
  function tearDownElement(obj) {
    // if the scroll snap attributes are applied on the body/html tag, use the doc for scroll events.
    var tag = obj.tagName;

    if (tag.toLowerCase() == "body" ||
        tag.toLowerCase() == "html") {
      obj = doc;
    }

    obj.removeEventListener('scroll', handler, false);

    obj.snapLengthUnit = null;
    obj.snapElements = [];
  }

  /**
   * attach a child-element onto a scroll-container
   * @param  {Object} obj
   */
  function attachToScrollParent(obj) {
    var attach = obj;
    // iterate over parent elements
    for ( ; obj && obj !== document; obj = obj.parentNode ) {
      if (typeof obj.snapElements !== 'undefined') {
        obj.snapElements.push(attach);
      }
    }
  }

  /**
   * the last created timeOutId for scroll event timeouts.
   * @type int
   */
  var timeOutId = null;

  /**
   * starting point for current scroll
   * @type length
   */
  var scrollStart = null;

  /**
   * the last object receiving a scroll event
   */
  var lastObj, lastScrollObj;

  /**
   * scroll handler
   * this is the callback for scroll events.
   */
  var handler = function(evt) {

    // use evt.target as target-element
    lastObj = evt.target;
    lastScrollObj = getScrollObj(lastObj);

    // if currently animating, stop it. this prevents flickering.
    if (animationFrame) {
      // cross browser
      if (!cancelAnimationFrame(animationFrame)) {
        clearTimeout(animationFrame);
      }
    }

    // if a previous timeout exists, clear it.
    if (timeOutId) {
      // we only want to call a timeout once after scrolling..
      clearTimeout(timeOutId);
    } else {
      // save new scroll start
      scrollStart = {y: lastScrollObj.scrollTop,
                     x: lastScrollObj.scrollLeft};
    }

    /* set a timeout for every scroll event.
     * if we have new scroll events in that time, the previous timeouts are cleared.
     * thus we can be sure that the timeout will be called 50ms after the last scroll event.
     * this means a huge improvement in speed, as we just assign a timeout in the scroll event, which will be called only once (after scrolling is finished)
     */
    timeOutId = setTimeout(handlerDelayed, SCROLL_TIMEOUT);
  };

  /**
   * a delayed handler for scrolling.
   * this will be called by setTimeout once, after scrolling is finished.
   */
  var handlerDelayed = function() {
    // if we don't move a thing, we can ignore the timeout: if we did, there'd be another timeout added for scrollStart+1.
    if(scrollStart.y == lastScrollObj.scrollTop && scrollStart.x == lastScrollObj.scrollLeft) {
      // ignore timeout
      return;
    }

    // detect direction of scroll. negative is up, positive is down.
    var direction = {y: (scrollStart.y - lastScrollObj.scrollTop > 0) ? -1 : 1,
                     x: (scrollStart.x - lastScrollObj.scrollLeft > 0) ? -1 : 1},
        snapPoint;

    if (typeof lastScrollObj.snapElements !== 'undefined' && lastScrollObj.snapElements.length > 0) {
      snapPoint = getNextElementSnapPoint(lastScrollObj, lastObj, direction);
    } else {
      // get the next snap-point to snap-to
      snapPoint = getNextSnapPoint(lastScrollObj, lastObj, direction);
    }

    // before doing the move, unbind the event handler (otherwise it calls itself kinda)
    lastObj.removeEventListener('scroll', handler, false);

    // smoothly move to the snap point
    smoothScroll(lastScrollObj, snapPoint, function() {
      // after moving to the snap point, rebind the scroll event handler
      lastObj.addEventListener('scroll', handler, false);
    });

    // we just jumped to the snapPoint, so this will be our next scrollStart
    if (!isNaN(snapPoint.x || !isNaN(snapPoint.y))) {
      scrollStart = snapPoint;
    }
  };

  /**
   * calculator for next snap-point
   * @param  {Object} obj       HTML element
   * @param  {integer} direction signed integer indicating the scroll direction
   * @return {Object}
   */
  function getNextSnapPoint(scrollObj, obj, direction) {
    // get snap length
    var snapLength = {y: getYSnapLength(obj, obj.snapLengthUnit.y),
                      x: getXSnapLength(obj, obj.snapLengthUnit.x)},
        top = scrollObj.scrollTop,
        left = scrollObj.scrollLeft;

    // calc current and initial snappoint
    var currentPoint = {y: top / snapLength.y,
                        x: left / snapLength.x},
        initialPoint = {y: scrollStart.y / snapLength.y,
                        x: scrollStart.x / snapLength.x},
        nextPoint = {y: 0, x: 0};

    // set target and bounds by direction
    nextPoint.y = roundByDirection(direction.y, currentPoint.y);
    nextPoint.x = roundByDirection(direction.x, currentPoint.x);

    // constrain by distance
    nextPoint.y = constrainByDistance(initialPoint.y, currentPoint.y, nextPoint.y, scrollStart.y, top);
    nextPoint.x = constrainByDistance(initialPoint.x, currentPoint.x, nextPoint.x, scrollStart.x, left);

    // calculate where to scroll
    var scrollTo = {y: nextPoint.y * snapLength.y,
                    x: nextPoint.x * snapLength.x};

    // stay in bounds (minimum: 0, maxmimum: absolute height)
    scrollTo.y = stayInBounds(0, getScrollHeight(scrollObj), scrollTo.y);
    scrollTo.x = stayInBounds(0, getScrollWidth(scrollObj), scrollTo.x);

    return scrollTo;
  }


  var currentIteratedObj = null,
      currentIteration = 0;

  function getNextElementSnapPoint(scrollObj, obj, direction) {
    var l = obj.snapElements.length,
        top = scrollObj.scrollTop,
        left = scrollObj.scrollLeft,
        // decide upon an iteration direction (favor -1, as 1 is default and will be applied when there is no direction on an axis)
        primaryDirection = Math.min(direction.y, direction.x),
        // get scrollable snap destination as offset
        snapDest = {y: getYSnapLength(obj, obj.snapLengthUnit.y),
                    x: getXSnapLength(obj, obj.snapLengthUnit.x)},
        snapCoords = {y: 0, x: 0};


    for(var i = currentIteration + primaryDirection; i<l && i >= 0; i = i+primaryDirection) {
      currentIteratedObj = obj.snapElements[i];

      // get objects snap coords by adding obj.top + obj.snaplength.y
      snapCoords = {y: (currentIteratedObj.offsetTop - scrollObj.offsetTop) + getYSnapLength(currentIteratedObj, currentIteratedObj.snapLengthUnit.y),
                    // & obj.left + obj.snaplength.x
                    x: (currentIteratedObj.offsetLeft - scrollObj.offsetLeft) + getXSnapLength(currentIteratedObj, currentIteratedObj.snapLengthUnit.x)};

      currentIteratedObj.snapCoords = snapCoords;
      // check if object snappoint is "close" enough to scrollable snappoint

      // not scrolled past element snap coords
      if ((left <= snapCoords.x && left + getWidth(scrollObj) >= snapCoords.x &&
           top <= snapCoords.y && top + getHeight(scrollObj) >= snapCoords.y)) {
        // ok, we found a snap point.
        currentIteration = i;
        // stay in bounds (minimum: 0, maxmimum: absolute height)
        return {y: stayInBounds(0, getScrollHeight(scrollObj), snapCoords.y - snapDest.y),
                x: stayInBounds(0, getScrollWidth(scrollObj), snapCoords.x - snapDest.x)};
      }
    }
    // no snap found, use first or last?
    if (primaryDirection == 1 && i === l-1) {
      currentIteration = l-1;
      // the for loop stopped at the last element
      return {y: stayInBounds(0, getScrollHeight(scrollObj), snapCoords.y - snapDest.y),
              x: stayInBounds(0, getScrollWidth(scrollObj), snapCoords.x - snapDest.x)};
    } else if (primaryDirection == -1 && i === 0) {
      currentIteration = 0;
      // the for loop stopped at the first element
      return {y: stayInBounds(0, getScrollHeight(scrollObj), snapCoords.y - snapDest.y),
              x: stayInBounds(0, getScrollWidth(scrollObj), snapCoords.x - snapDest.x)};
	}
    // stay in the same place
    return {y: stayInBounds(0, getScrollHeight(scrollObj), obj.snapElements[currentIteration].snapCoords.y - snapDest.y),
            x: stayInBounds(0, getScrollWidth(scrollObj), obj.snapElements[currentIteration].snapCoords.x - snapDest.x)};
  }

  /**
   * ceil or floor a number based on direction
   * @param  {Number} direction
   * @param  {Number} currentPoint
   * @return {Number}
   */
  function roundByDirection(direction, currentPoint) {
    if (direction === -1) {
      // when we go up, we floor the number to jump to the next snap-point in scroll direction
      return Math.floor(currentPoint);
    }
    // go down, we ceil the number to jump to the next in view.
    return Math.ceil(currentPoint);
  }

  /**
   * constrain jumping
   * @param  {Number} initialPoint
   * @param  {Number} currentPoint
   * @param  {Number} nextPoint
   * @return {Number}
   */
  function constrainByDistance(initialPoint, currentPoint, nextPoint, scrollStart, currentScrollValue) {
    if ((Math.abs(initialPoint - currentPoint) >= SNAP_CONSTRAINT) &&
         Math.abs(nextPoint - currentPoint) > CONSTRAINT) {

      // constrain jumping to a point too high/low when scrolling for more than SNAP_CONSTRAINT points.
      // (if the point is 85% further than we are, don't jump..)
      return Math.round(currentPoint);

    }
    if ((Math.abs(scrollStart-currentScrollValue) < MIN_PX_CONSTRAINT) &&
        (Math.abs(initialPoint - currentPoint) < SNAP_CONSTRAINT) &&
        (Math.abs(nextPoint - currentPoint) > FIRST_CONSTRAINT)) {
      // constrain jumping to a point too high/low when scrolling just for a few pixels (less than 10 pixels) and (5% of scrollable length)
      return Math.round(currentPoint);
    }
    return nextPoint;
  }

  /**
   * keep scrolling in bounds
   * @param  {Number} min
   * @param  {Number} max
   * @param  {Number} destined
   * @return {Number}
   */
  function stayInBounds(min, max, destined) {
    return Math.max(Math.min(destined, max), min);
  }

  /**
   * parse snap point value from declaration.
   * this uses regexp..
   * @param  {Object} declaration
   * @return {Object} returns an Object with the value and unit of the snap-point-y declaration
   */
  function parseSnapPointValue(declaration) {
    // regex to parse lengths
    var regex = /repeat\((\d+)(px|vh|vw|%)\)/g,
        // defaults
        parsed = {y: {value: 0, unit: 'px'},
                  x: {value: 0, unit: 'px'}},
        result;

    // parse y value and unit
    if (declaration['scroll-snap-points-y'] !== 'undefined') {
      result = regex.exec(declaration['scroll-snap-points-y']);
      // if regexp fails, value is null
      if (result !== null) {
        parsed.y = {value: result[1], unit: result[2]};
      }
    }

    // parse x value and unit
    if (declaration['scroll-snap-points-x'] !== 'undefined') {
      result = regex.exec(declaration['scroll-snap-points-x']);
      // if regexp fails, value is null
      if (result !== null) {
        parsed.x = {value: result[1], unit: result[2]};
      }
    }
    return parsed;
  }

  /**
   * parse snap destination/coordinate values.
   * @param  {Object} declaration
   * @return {Object}
   */
  function parseSnapCoordValue(declaration) {
    // regex to parse lengths
    var regex = /(\d+)(px|%) (\d+)(px|%)/g,
        // defaults
        parsed = {y: {value: 0, unit: 'px'},
                  x: {value: 0, unit: 'px'}},
        parsable,
        result;

    if(typeof declaration['scroll-snap-coordinate'] !== 'undefined') {
      parsable = 'scroll-snap-coordinate';
    } else if (typeof declaration['scroll-snap-destination'] !== 'undefined') {
      parsable = 'scroll-snap-destination';
    }

    // parse value and unit
    if (parsable !== null) {
      result = regex.exec(declaration[parsable]);
      // if regexp fails, value is null
      if (result !== null) {
        parsed.y = {value: result[1], unit: result[2]};
        parsed.x = {value: result[3], unit: result[4]};
      }
    }
    return parsed;
  }

  /**
   * calc length of one snap on y-axis
   * @param  {Object} declaration the parsed declaration
   * @return {Number}
   */
  function getYSnapLength(obj, declaration) {
    if (declaration.unit == 'vh') {
      // when using vh, one snap is the length of vh / 100 * value
      return Math.max(doc.documentElement.clientHeight, w.innerHeight || 1) / 100 * declaration.value;
    } else if (declaration.unit == '%') {
      // when using %, one snap is the length of element height / 100 * value
      return getHeight(obj) / 100 * declaration.value;
    } else {
      // when using px, one snap is the length of element height / value
      return getHeight(obj) / declaration.value;
    }

    return 0;
  }

  /**
   * calc length of one snap on x-axis
   * @param  {Object} declaration the parsed declaration
   * @return {Number}
   */
  function getXSnapLength(obj, declaration) {
    if (declaration.unit == 'vw') {
      // when using vw, one snap is the length of vw / 100 * value
      return Math.max(doc.documentElement.clientWidth, w.innerWidth || 1) / 100 * declaration.value;
    } else if (declaration.unit == '%') {
      // when using %, one snap is the length of element width / 100 * value
      return getWidth(obj) / 100 * declaration.value;
    } else {
      // when using px, one snap is the length of element width / value
      return getWidth(obj) / declaration.value;
    }

    return 0;
  }

  /**
   * get an elements scrollable height
   * @param  {Object} obj
   * @return {Number}
   */
  function getScrollHeight(obj) {
    return obj.scrollHeight;
  }

  /**
   * get an elements scrollable width
   * @param  {Object} obj
   * @return {Number}
   */
  function getScrollWidth(obj) {
    return obj.scrollWidth;
  }

  /**
   * get an elements height
   * @param  {Object} obj
   * @return {Number}
   */
  function getHeight(obj) {
    return obj.offsetHeight;
  }

  /**
   * get an elements width
   * @param  {Object} obj
   * @return {Number}
   */
  function getWidth(obj) {
    return obj.offsetWidth;
  }

  /**
   * return the element scrolling values are applied to.
   * when receiving window.onscroll events, the actual scrolling is on the body.
   * @param  {Object} obj
   * @return {Object}
   */
  function getScrollObj(obj) {
    // if the scroll container is body, the scrolling is invoked on window/doc.
    if (obj == doc || obj == w) {
      // firefox scrolls on doc.documentElement
      if (doc.documentElement.scrollTop > 0 || doc.documentElement.scrollLeft > 0) {
        return doc.documentElement;
      }
      // chrome scrolls on body
      return doc.querySelector('body');
    }

    return obj;
  }

  /**
   * calc the duration of the animation proportional to the distance travelled
   * @param  {Number} start
   * @param  {Number} end
   * @return {Number}       scroll time in ms
   */
  function getDuration(start, end) {
    var distance = Math.abs(start - end),
        procDist = 100 / Math.max(doc.documentElement.clientHeight, w.innerHeight || 1) * distance,
        duration = 100 / SCROLL_TIME * procDist;

    if (isNaN(duration)) {
      return 0;
    }

    return Math.max(SCROLL_TIME / 1.5, Math.min(duration, SCROLL_TIME));
  }

  /**
   * ease in out function thanks to:
   * http://blog.greweb.fr/2012/02/bezier-curve-based-easing-functions-from-concept-to-implementation/
   * @param  {Number} t timing
   * @return {Number}   easing factor
   */
  var easeInCubic = function(t) {
    return t*t*t;
  };


  /**
   * calculate the scroll position we should be in
   * @param  {Number} start    the start point of the scroll
   * @param  {Number} end      the end point of the scroll
   * @param  {Number} elapsed  the time elapsed from the beginning of the scroll
   * @param  {Number} duration the total duration of the scroll (default 500ms)
   * @return {Number}          the next position
   */
  var position = function(start, end, elapsed, duration) {
      if (elapsed > duration) {
        return end;
      }
      return start + (end - start) * easeInCubic(elapsed / duration);
  };

  // a current animation frame
  var animationFrame = null;

  /**
   * smoothScroll function by Alice Lietieur.
   * @see https://github.com/alicelieutier/smoothScroll
   * we use requestAnimationFrame to be called by the browser before every repaint
   * @param  {Object}   obj      the scroll context
   * @param  {Number}  end      where to scroll to
   * @param  {Number}   duration scroll duration
   * @param  {Function} callback called when the scrolling is finished
   */
  var smoothScroll = function(obj, end, callback) {
    var start = {y: obj.scrollTop, x: obj.scrollLeft},

        clock = Date.now(),

        // get animation frame or a fallback
        requestAnimationFrame = w.requestAnimationFrame ||
                                w.mozRequestAnimationFrame ||
                                w.webkitRequestAnimationFrame ||
                                function(fn){w.setTimeout(fn, 15);},
        duration = Math.max(getDuration(start.y, end.y), getDuration(start.x, end.x));

      // setup the stepping function
      var step = function() {

        // calculate timings
        var elapsed = Date.now() - clock;

        // change position on y-axis if result is a number.
        if (!isNaN(end.y)) {
          obj.scrollTop = position(start.y, end.y, elapsed, duration);
        }

        // change position on x-axis if result is a number.
        if (!isNaN(end.x)) {
          obj.scrollLeft = position(start.x, end.x, elapsed, duration);
        }

        // check if we are over due
        if (elapsed > duration) {
          // is there a callback?
          if (typeof callback === 'function') {
            // stop execution and run the callback
            return callback(end);
          }

          // stop execution
          return;
        }

        // use a new animation frame
        animationFrame = requestAnimationFrame(step);
      };

      // start the first step
      step();
  };

  /**
   * Polyfill object
   * @type Polyfill
   * @see https://github.com/philipwalton/polyfill
   */
  var pf = new Polyfill({
    declarations:["scroll-snap-type:*", "scroll-snap-point-y:*", "scroll-snap-coordinate:*", "scroll-snap-destination:*"]
  })
  .doMatched(doMatched)
  .undoUnmatched(undoUnmatched);

}(window, document));