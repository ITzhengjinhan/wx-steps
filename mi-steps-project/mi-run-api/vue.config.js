module.exports = {
  publicPath:'./',
  pages:{
	  index:{
		  entry:'src/main.js',
		  title:'帮你出去走走'
	  }
  },
  devServer: {
    proxy: {
      '/run': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true
      }
    }
  }
}