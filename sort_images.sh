#/bin/bash
#mkdir horz
mkdir vert
for f in ./*.JPG
do
  r=$(identify -format '%[fx:(h>w)]' "$f")
  if [[ r -eq 1 ]] 
  then
      mv "$f" vert
  else
  # do nothing
  #    mv "$f" horz
  fi
done

