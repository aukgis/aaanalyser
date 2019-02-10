import sys, os.path
import site

site.addsitedir(os.path.expanduser('~/env/lib/python2.7/site-packages'))

current_dir =  os.path.dirname(__file__)
sys.path.insert(0, current_dir)

from server import app as application

sys.stdout = sys.stderr

