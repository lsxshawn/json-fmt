export class SearchController {
  constructor(index, text) {
    this.index = index;
    this.text = text;
    this.results = [];
    this.currentIndex = -1;
    this.searchWorker = null;
    this.isSearching = false;
  }

  search(query, options = {}) {
    return new Promise((resolve) => {
      if (!query || query.trim() === '') {
        this.results = [];
        this.currentIndex = -1;
        resolve([]);
        return;
      }
      
      this.isSearching = true;
      this.results = [];
      this.currentIndex = -1;
      
      const keyResults = this.index.searchKeys(query);
      this.results = keyResults.map(r => ({
        type: 'key',
        line: r.line,
        position: r.position,
        length: r.length,
        text: this.text.substring(r.position, r.position + r.length)
      }));
      
      if (options.searchValues !== false && this.text.length < 50 * 1024 * 1024) {
        this._searchValuesAsync(query).then((valueResults) => {
          this.results = [...this.results, ...valueResults];
          this.results.sort((a, b) => a.line - b.line);
          this.isSearching = false;
          resolve(this.results);
        });
      } else {
        this.isSearching = false;
        resolve(this.results);
      }
    });
  }

  _searchValuesAsync(query) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const valueResults = [];
        const queryLower = query.toLowerCase();
        
        const lines = this.text.split('\n');
        lines.forEach((line, index) => {
          let pos = line.toLowerCase().indexOf(queryLower);
          while (pos !== -1) {
            const before = line.substring(0, pos);
            const quoteCount = (before.match(/"/g) || []).length;
            
            if (quoteCount % 2 === 1) {
              valueResults.push({
                type: 'value',
                line: index + 1,
                position: this.index.getLineStart(index + 1) + pos,
                length: query.length,
                text: line.substring(pos, pos + query.length)
              });
            }
            
            pos = line.toLowerCase().indexOf(queryLower, pos + 1);
          }
        });
        
        resolve(valueResults);
      }, 0);
    });
  }

  getNext() {
    if (this.results.length === 0) return null;
    
    this.currentIndex = (this.currentIndex + 1) % this.results.length;
    return this.results[this.currentIndex];
  }

  getPrevious() {
    if (this.results.length === 0) return null;
    
    this.currentIndex = (this.currentIndex - 1 + this.results.length) % this.results.length;
    return this.results[this.currentIndex];
  }

  getCurrent() {
    if (this.currentIndex < 0 || this.currentIndex >= this.results.length) return null;
    return this.results[this.currentIndex];
  }

  getResults() {
    return this.results;
  }

  getResultCount() {
    return this.results.length;
  }

  destroy() {
    if (this.searchWorker) {
      this.searchWorker.terminate();
      this.searchWorker = null;
    }
    this.results = [];
    this.currentIndex = -1;
    this.isSearching = false;
  }
}